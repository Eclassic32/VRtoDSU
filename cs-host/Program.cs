using System;
using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Nefarius.ViGEm.Client;
using Nefarius.ViGEm.Client.Targets;
using Nefarius.ViGEm.Client.Targets.Xbox360;

class Program
{
    // Configuration
    const int DSU_PORT = 26760;
    const int HTTP_PORT = 3000;
    const int HTTPS_PORT = 3443;
    const ushort PROTOCOL_VERSION = 1001;
    
    // DSU Protocol message types
    const uint MSG_TYPE_VERSION = 0x100000;
    const uint MSG_TYPE_PORTS = 0x100001;
    const uint MSG_TYPE_DATA = 0x100002;
    
    static readonly uint ServerID = (uint)Random.Shared.Next();
    
    // Controller state
    static readonly ControllerState[] Controllers = new ControllerState[4];
    
    // DSU client tracking
    static IPEndPoint? DsuClient = null;
    static readonly object DsuClientLock = new();
    
    // ViGEm
    static ViGEmClient? VigemClient;
    static IXbox360Controller? Xbox360Controller;
    
    // WebSocket clients
    static readonly ConcurrentDictionary<Guid, WebSocket> WsClients = new();
    
    // CRC32 table
    static readonly uint[] Crc32Table = new uint[256];
    
    // Certificate
    static X509Certificate2? HttpsCertificate;
    
    // Web root path
    static string WebRoot = "";
    
    static Program()
    {
        // Initialize controllers
        for (int i = 0; i < 4; i++)
            Controllers[i] = new ControllerState((byte)i);
        
        // Initialize CRC32 table
        for (uint i = 0; i < 256; i++)
        {
            uint c = i;
            for (int j = 0; j < 8; j++)
                c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1;
            Crc32Table[i] = c;
        }
    }
    
    static async Task Main(string[] args)
    {
        Console.WriteLine("🎮 VR to DSU Server (C# Edition)");
        Console.WriteLine("================================");
        
        // Determine web root - try several possible locations
        string[] possibleRoots = new[]
        {
            Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "..", "..", "web")),
            Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "web")),
            Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "web")),
            Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "web")),
        };
        
        WebRoot = possibleRoots.FirstOrDefault(Directory.Exists) ?? possibleRoots[0];
        Console.WriteLine($"📁 Web root: {WebRoot}");
        
        if (!Directory.Exists(WebRoot))
        {
            Console.WriteLine("⚠️ Web root not found! Static files will not be served.");
        }
        
        // Generate self-signed certificate
        Console.WriteLine("🔐 Generating self-signed certificate...");
        HttpsCertificate = GenerateSelfSignedCertificate();
        Console.WriteLine("✅ Certificate generated");
        
        // Initialize ViGEm
        try
        {
            VigemClient = new ViGEmClient();
            Xbox360Controller = VigemClient.CreateXbox360Controller();
            Xbox360Controller.Connect();
            Console.WriteLine("✅ Virtual Xbox 360 controller connected!");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"⚠️ ViGEm not available: {ex.Message}");
        }
        
        // Start DSU UDP server on dedicated thread
        var dsuThread = new Thread(DsuServerThread) { IsBackground = true, Name = "DSU Server" };
        dsuThread.Start();
        
        // Start DSU data streaming on dedicated high-priority thread
        var streamThread = new Thread(DsuStreamThread) { IsBackground = true, Name = "DSU Stream", Priority = ThreadPriority.AboveNormal };
        streamThread.Start();
        
        // Start HTTP server
        _ = Task.Run(() => StartKestrelServer());
        
        Console.WriteLine($"🌐 HTTP Server: http://localhost:{HTTP_PORT}");
        Console.WriteLine($"🔒 HTTPS Server: https://localhost:{HTTPS_PORT}");
        Console.WriteLine($"🎮 DSU Server: localhost:{DSU_PORT}");
        Console.WriteLine();
        Console.WriteLine("📋 Instructions:");
        Console.WriteLine("   For Quest Browser:");
        Console.WriteLine($"   1. First visit https://YOUR_PC_IP:{HTTPS_PORT} and accept the certificate");
        Console.WriteLine($"   2. Then open GitHub Pages and enter YOUR_PC_IP:{HTTPS_PORT}");
        Console.WriteLine();
        Console.WriteLine("Press Ctrl+C to exit");
        
        // Wait for shutdown
        var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (s, e) => { e.Cancel = true; cts.Cancel(); };
        
        try
        {
            await Task.Delay(-1, cts.Token);
        }
        catch (TaskCanceledException) { }
        
        Console.WriteLine("\nShutting down...");
        Xbox360Controller?.Disconnect();
        VigemClient?.Dispose();
    }
    
    static X509Certificate2 GenerateSelfSignedCertificate()
    {
        // Get local IP
        string localIP = "192.168.0.1";
        try
        {
            using var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, 0);
            socket.Connect("8.8.8.8", 65530);
            localIP = ((IPEndPoint)socket.LocalEndPoint!).Address.ToString();
        }
        catch { }
        
        using var rsa = RSA.Create(2048);
        
        var request = new CertificateRequest(
            $"CN={localIP}, O=VRtoDSU",
            rsa,
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);
        
        // Add extensions
        request.CertificateExtensions.Add(
            new X509BasicConstraintsExtension(false, false, 0, false));
        
        request.CertificateExtensions.Add(
            new X509KeyUsageExtension(
                X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment,
                false));
        
        request.CertificateExtensions.Add(
            new X509EnhancedKeyUsageExtension(
                new OidCollection { new Oid("1.3.6.1.5.5.7.3.1") }, // Server Auth
                false));
        
        // Subject Alternative Names
        var sanBuilder = new SubjectAlternativeNameBuilder();
        sanBuilder.AddDnsName("localhost");
        sanBuilder.AddIpAddress(IPAddress.Parse("127.0.0.1"));
        sanBuilder.AddIpAddress(IPAddress.Parse(localIP));
        request.CertificateExtensions.Add(sanBuilder.Build());
        
        var cert = request.CreateSelfSigned(
            DateTimeOffset.UtcNow.AddDays(-1),
            DateTimeOffset.UtcNow.AddYears(1));
        
        // Export and re-import to make it usable with SslStream
        return new X509Certificate2(
            cert.Export(X509ContentType.Pfx, ""),
            "",
            X509KeyStorageFlags.MachineKeySet | X509KeyStorageFlags.Exportable);
    }
    
    static async Task StartKestrelServer()
    {
        // Simple TCP-based HTTP/HTTPS server
        var httpListener = new TcpListener(IPAddress.Any, HTTP_PORT);
        var httpsListener = new TcpListener(IPAddress.Any, HTTPS_PORT);
        
        httpListener.Start();
        httpsListener.Start();
        
        // Accept HTTP connections
        _ = Task.Run(async () =>
        {
            while (true)
            {
                try
                {
                    var client = await httpListener.AcceptTcpClientAsync();
                    _ = HandleHttpConnection(client, false);
                }
                catch { }
            }
        });
        
        // Accept HTTPS connections
        _ = Task.Run(async () =>
        {
            while (true)
            {
                try
                {
                    var client = await httpsListener.AcceptTcpClientAsync();
                    _ = HandleHttpConnection(client, true);
                }
                catch { }
            }
        });
    }
    
    static async Task HandleHttpConnection(TcpClient client, bool useSsl)
    {
        try
        {
            client.NoDelay = true;
            Stream stream = client.GetStream();
            
            if (useSsl && HttpsCertificate != null)
            {
                var sslStream = new System.Net.Security.SslStream(stream, false);
                await sslStream.AuthenticateAsServerAsync(HttpsCertificate);
                stream = sslStream;
            }
            
            using var reader = new StreamReader(stream, Encoding.UTF8, leaveOpen: true);
            
            // Read HTTP request
            string? requestLine = await reader.ReadLineAsync();
            if (string.IsNullOrEmpty(requestLine)) return;
            
            var parts = requestLine.Split(' ');
            if (parts.Length < 2) return;
            
            string method = parts[0];
            string path = parts[1];
            
            // Read headers
            var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            string? line;
            while (!string.IsNullOrEmpty(line = await reader.ReadLineAsync()))
            {
                int colonIndex = line.IndexOf(':');
                if (colonIndex > 0)
                {
                    string key = line.Substring(0, colonIndex).Trim();
                    string value = line.Substring(colonIndex + 1).Trim();
                    headers[key] = value;
                }
            }
            
            // Check for WebSocket upgrade
            if (headers.TryGetValue("Upgrade", out var upgrade) && 
                upgrade.Equals("websocket", StringComparison.OrdinalIgnoreCase))
            {
                await HandleWebSocketUpgrade(stream, headers);
                return;
            }
            
            // Serve static files
            await ServeStaticFile(stream, path);
        }
        catch { }
        finally
        {
            client.Close();
        }
    }
    
    static async Task HandleWebSocketUpgrade(Stream stream, Dictionary<string, string> headers)
    {
        if (!headers.TryGetValue("Sec-WebSocket-Key", out var wsKey)) return;
        
        // Calculate accept key
        string acceptKey = Convert.ToBase64String(
            SHA1.HashData(Encoding.UTF8.GetBytes(wsKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
        
        // Send upgrade response
        string response = 
            "HTTP/1.1 101 Switching Protocols\r\n" +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            $"Sec-WebSocket-Accept: {acceptKey}\r\n\r\n";
        
        byte[] responseBytes = Encoding.UTF8.GetBytes(response);
        await stream.WriteAsync(responseBytes);
        
        // Handle WebSocket frames
        var id = Guid.NewGuid();
        Console.WriteLine("📱 WebXR client connected");
        
        try
        {
            byte[] buffer = new byte[4096];
            
            while (true)
            {
                // Read frame header
                int b1 = stream.ReadByte();
                int b2 = stream.ReadByte();
                if (b1 < 0 || b2 < 0) break;
                
                bool fin = (b1 & 0x80) != 0;
                int opcode = b1 & 0x0F;
                bool masked = (b2 & 0x80) != 0;
                long payloadLen = b2 & 0x7F;
                
                if (opcode == 8) break; // Close frame
                
                if (payloadLen == 126)
                {
                    int b3 = stream.ReadByte();
                    int b4 = stream.ReadByte();
                    if (b3 < 0 || b4 < 0) break;
                    payloadLen = (b3 << 8) | b4;
                }
                else if (payloadLen == 127)
                {
                    byte[] lenBytes = new byte[8];
                    if (await stream.ReadAsync(lenBytes, 0, 8) < 8) break;
                    payloadLen = BinaryPrimitives.ReadInt64BigEndian(lenBytes);
                }
                
                byte[]? mask = null;
                if (masked)
                {
                    mask = new byte[4];
                    if (await stream.ReadAsync(mask, 0, 4) < 4) break;
                }
                
                // Read payload
                if (payloadLen > buffer.Length)
                    buffer = new byte[payloadLen];
                
                int totalRead = 0;
                while (totalRead < payloadLen)
                {
                    int read = await stream.ReadAsync(buffer, totalRead, (int)(payloadLen - totalRead));
                    if (read <= 0) break;
                    totalRead += read;
                }
                
                // Unmask
                if (masked && mask != null)
                {
                    for (int i = 0; i < payloadLen; i++)
                        buffer[i] ^= mask[i % 4];
                }
                
                // Process text frame
                if (opcode == 1)
                {
                    string json = Encoding.UTF8.GetString(buffer, 0, (int)payloadLen);
                    ProcessWebSocketMessage(json);
                }
            }
        }
        catch { }
        finally
        {
            Console.WriteLine("📱 WebXR client disconnected");
            foreach (var ctrl in Controllers) ctrl.Connected = false;
        }
    }
    
    static async Task ServeStaticFile(Stream stream, string path)
    {
        if (path == "/") path = "/index.html";
        path = path.Split('?')[0]; // Remove query string
        
        string filePath = Path.GetFullPath(Path.Combine(WebRoot, path.TrimStart('/')));
        
        // Security: ensure path is within web root
        if (!filePath.StartsWith(WebRoot))
        {
            await SendHttpResponse(stream, 403, "Forbidden", "text/plain", "Forbidden"u8.ToArray());
            return;
        }
        
        if (File.Exists(filePath))
        {
            byte[] content = await File.ReadAllBytesAsync(filePath);
            string ext = Path.GetExtension(filePath).ToLower();
            string contentType = ext switch
            {
                ".html" => "text/html; charset=utf-8",
                ".js" => "text/javascript; charset=utf-8",
                ".css" => "text/css; charset=utf-8",
                ".json" => "application/json",
                ".png" => "image/png",
                ".ico" => "image/x-icon",
                _ => "application/octet-stream"
            };
            await SendHttpResponse(stream, 200, "OK", contentType, content);
        }
        else
        {
            await SendHttpResponse(stream, 404, "Not Found", "text/plain", "Not Found"u8.ToArray());
        }
    }
    
    static async Task SendHttpResponse(Stream stream, int statusCode, string statusText, string contentType, byte[] body)
    {
        string headers = 
            $"HTTP/1.1 {statusCode} {statusText}\r\n" +
            $"Content-Type: {contentType}\r\n" +
            $"Content-Length: {body.Length}\r\n" +
            "Access-Control-Allow-Origin: *\r\n" +
            "Connection: close\r\n\r\n";
        
        byte[] headerBytes = Encoding.UTF8.GetBytes(headers);
        await stream.WriteAsync(headerBytes);
        await stream.WriteAsync(body);
    }
    
    static void DsuServerThread()
    {
        using var udp = new UdpClient(DSU_PORT);
        Console.WriteLine($"🎮 DSU Server listening on port {DSU_PORT}");
        
        while (true)
        {
            try
            {
                IPEndPoint? remoteEP = null;
                byte[] data = udp.Receive(ref remoteEP);
                
                if (data.Length < 20) continue;
                if (Encoding.ASCII.GetString(data, 0, 4) != "DSUC") continue;
                
                uint msgType = BinaryPrimitives.ReadUInt32LittleEndian(data.AsSpan(16));
                
                // Update client endpoint (thread-safe)
                lock (DsuClientLock)
                {
                    if (DsuClient == null || !DsuClient.Address.Equals(remoteEP!.Address))
                        Console.WriteLine($"📨 DSU client connected: {remoteEP!.Address}");
                    DsuClient = remoteEP;
                }
                
                switch (msgType)
                {
                    case MSG_TYPE_VERSION:
                        byte[] versionResp = BuildVersionResponse();
                        udp.Send(versionResp, versionResp.Length, remoteEP);
                        break;
                        
                    case MSG_TYPE_PORTS:
                        int numPorts = BinaryPrimitives.ReadInt32LittleEndian(data.AsSpan(20));
                        for (int i = 0; i < Math.Min(numPorts, 4); i++)
                        {
                            byte slot = data[24 + i];
                            if (slot < 4)
                            {
                                byte[] resp = BuildControllerInfoResponse(slot);
                                udp.Send(resp, resp.Length, remoteEP);
                            }
                        }
                        break;
                        
                    case MSG_TYPE_DATA:
                        // Send immediate data burst to new port
                        for (int slot = 0; slot < 4; slot++)
                        {
                            if (Controllers[slot].Connected)
                            {
                                byte[] packet = BuildControllerDataPacket((byte)slot);
                                udp.Send(packet, packet.Length, remoteEP);
                            }
                        }
                        break;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"DSU error: {ex.Message}");
            }
        }
    }
    
    static void DsuStreamThread()
    {
        using var udp = new UdpClient();
        var sw = System.Diagnostics.Stopwatch.StartNew();
        long lastTick = 0;
        const long tickInterval = 4; // ~250Hz (4ms)
        
        while (true)
        {
            long now = sw.ElapsedMilliseconds;
            if (now - lastTick < tickInterval)
            {
                Thread.SpinWait(100); // Tight spin for accuracy
                continue;
            }
            lastTick = now;
            
            IPEndPoint? client;
            lock (DsuClientLock)
                client = DsuClient;
            
            if (client == null) continue;
            
            for (int slot = 0; slot < 4; slot++)
            {
                if (Controllers[slot].Connected)
                {
                    try
                    {
                        byte[] packet = BuildControllerDataPacket((byte)slot);
                        udp.Send(packet, packet.Length, client);
                    }
                    catch { }
                }
            }
        }
    }
    
    static uint CalculateCrc32(byte[] data)
    {
        uint crc = 0xFFFFFFFF;
        foreach (byte b in data)
            crc = Crc32Table[(crc ^ b) & 0xFF] ^ (crc >> 8);
        return crc ^ 0xFFFFFFFF;
    }
    
    static byte[] BuildHeader(uint messageType, ushort payloadLength)
    {
        byte[] header = new byte[20];
        Encoding.ASCII.GetBytes("DSUS", 0, 4, header, 0);
        BinaryPrimitives.WriteUInt16LittleEndian(header.AsSpan(4), PROTOCOL_VERSION);
        BinaryPrimitives.WriteUInt16LittleEndian(header.AsSpan(6), (ushort)(payloadLength + 4));
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(12), ServerID);
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(16), messageType);
        return header;
    }
    
    static void FinalizeCrc(byte[] packet)
    {
        packet[8] = packet[9] = packet[10] = packet[11] = 0;
        uint crc = CalculateCrc32(packet);
        BinaryPrimitives.WriteUInt32LittleEndian(packet.AsSpan(8), crc);
    }
    
    static byte[] BuildVersionResponse()
    {
        byte[] header = BuildHeader(MSG_TYPE_VERSION, 2);
        byte[] payload = new byte[2];
        BinaryPrimitives.WriteUInt16LittleEndian(payload, PROTOCOL_VERSION);
        byte[] packet = new byte[header.Length + payload.Length];
        header.CopyTo(packet, 0);
        payload.CopyTo(packet, header.Length);
        FinalizeCrc(packet);
        return packet;
    }
    
    static byte[] BuildControllerInfoResponse(byte slot)
    {
        var ctrl = Controllers[slot];
        byte[] header = BuildHeader(MSG_TYPE_PORTS, 12);
        byte[] payload = new byte[12];
        
        payload[0] = slot;
        payload[1] = ctrl.Connected ? (byte)2 : (byte)0;
        payload[2] = 2;
        payload[3] = 0;
        ctrl.Mac.CopyTo(payload, 4);
        payload[10] = ctrl.Connected ? (byte)0x05 : (byte)0x00;
        payload[11] = 0;
        
        byte[] packet = new byte[header.Length + payload.Length];
        header.CopyTo(packet, 0);
        payload.CopyTo(packet, header.Length);
        FinalizeCrc(packet);
        return packet;
    }
    
    static byte[] BuildControllerDataPacket(byte slot)
    {
        var ctrl = Controllers[slot];
        byte[] header = BuildHeader(MSG_TYPE_DATA, 80);
        byte[] payload = new byte[80];
        int offset = 0;
        
        payload[offset++] = slot;
        payload[offset++] = 2;
        payload[offset++] = 2;
        payload[offset++] = 0;
        ctrl.Mac.CopyTo(payload, offset); offset += 6;
        payload[offset++] = 0x05;
        payload[offset++] = 1;
        
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(offset), ctrl.PacketNumber++);
        offset += 4;
        
        payload[offset++] = ctrl.Buttons1;
        payload[offset++] = ctrl.Buttons2;
        payload[offset++] = 0;
        payload[offset++] = 0;
        
        payload[offset++] = ctrl.LeftStickX;
        payload[offset++] = ctrl.LeftStickY;
        payload[offset++] = ctrl.RightStickX;
        payload[offset++] = ctrl.RightStickY;
        
        offset += 4; // D-pad
        
        payload[offset++] = (ctrl.Buttons2 & 0x80) != 0 ? (byte)255 : (byte)0;
        payload[offset++] = (ctrl.Buttons2 & 0x40) != 0 ? (byte)255 : (byte)0;
        payload[offset++] = (ctrl.Buttons2 & 0x20) != 0 ? (byte)255 : (byte)0;
        payload[offset++] = (ctrl.Buttons2 & 0x10) != 0 ? (byte)255 : (byte)0;
        
        payload[offset++] = ctrl.AnalogR1;
        payload[offset++] = ctrl.AnalogL1;
        payload[offset++] = ctrl.AnalogR2;
        payload[offset++] = ctrl.AnalogL2;
        
        offset += 12; // Touch
        
        BinaryPrimitives.WriteUInt64LittleEndian(payload.AsSpan(offset), (ulong)DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() * 1000);
        offset += 8;
        
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(offset), ctrl.AccelX); offset += 4;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(offset), ctrl.AccelY); offset += 4;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(offset), ctrl.AccelZ); offset += 4;
        
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(offset), ctrl.GyroX); offset += 4;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(offset), ctrl.GyroY); offset += 4;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(offset), ctrl.GyroZ); offset += 4;
        
        byte[] packet = new byte[header.Length + payload.Length];
        header.CopyTo(packet, 0);
        payload.CopyTo(packet, header.Length);
        FinalizeCrc(packet);
        return packet;
    }
    
    static void ProcessWebSocketMessage(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            string type = root.GetProperty("type").GetString() ?? "";
            
            switch (type)
            {
                case "controller_data":
                    ProcessControllerData(root);
                    break;
                case "combined_controller":
                    ProcessCombinedController(root);
                    break;
            }
        }
        catch { }
    }
    
    static void ProcessControllerData(JsonElement root)
    {
        int slot = root.TryGetProperty("slot", out var s) ? s.GetInt32() : 0;
        if (slot >= 4) return;
        
        var ctrl = Controllers[slot];
        ctrl.Connected = true;
        
        if (root.TryGetProperty("accel", out var accel))
        {
            ctrl.AccelX = (float)(accel.TryGetProperty("x", out var x) ? x.GetDouble() : 0);
            ctrl.AccelY = (float)(accel.TryGetProperty("y", out var y) ? y.GetDouble() : 0);
            ctrl.AccelZ = (float)(accel.TryGetProperty("z", out var z) ? z.GetDouble() : 0);
        }
        
        if (root.TryGetProperty("gyro", out var gyro))
        {
            const float RadToDeg = 180f / MathF.PI;
            ctrl.GyroX = (float)(gyro.TryGetProperty("x", out var x) ? x.GetDouble() : 0) * RadToDeg;
            ctrl.GyroY = (float)(gyro.TryGetProperty("y", out var y) ? y.GetDouble() : 0) * RadToDeg;
            ctrl.GyroZ = (float)(gyro.TryGetProperty("z", out var z) ? z.GetDouble() : 0) * RadToDeg;
        }
        
        if (root.TryGetProperty("buttons1", out var b1)) ctrl.Buttons1 = (byte)b1.GetInt32();
        if (root.TryGetProperty("buttons2", out var b2)) ctrl.Buttons2 = (byte)b2.GetInt32();
        
        if (root.TryGetProperty("thumbstick", out var stick))
        {
            float stickX = (float)(stick.TryGetProperty("x", out var x) ? x.GetDouble() : 0);
            float stickY = (float)(stick.TryGetProperty("y", out var y) ? y.GetDouble() : 0);
            
            if (slot == 0)
            {
                ctrl.LeftStickX = (byte)Math.Clamp((stickX + 1) * 127.5f, 0, 255);
                ctrl.LeftStickY = (byte)Math.Clamp((stickY + 1) * 127.5f, 0, 255);
            }
            else
            {
                ctrl.RightStickX = (byte)Math.Clamp((stickX + 1) * 127.5f, 0, 255);
                ctrl.RightStickY = (byte)Math.Clamp((stickY + 1) * 127.5f, 0, 255);
            }
        }
        
        if (root.TryGetProperty("trigger", out var trig))
        {
            byte val = (byte)(trig.GetDouble() * 255);
            if (slot == 0) ctrl.AnalogL2 = val; else ctrl.AnalogR2 = val;
        }
        
        if (root.TryGetProperty("grip", out var grip))
        {
            byte val = (byte)(grip.GetDouble() * 255);
            if (slot == 0) ctrl.AnalogL1 = val; else ctrl.AnalogR1 = val;
        }
        
        UpdateVigem();
    }
    
    static void ProcessCombinedController(JsonElement root)
    {
        var ctrl = Controllers[0];
        ctrl.Connected = true;
        
        if (root.TryGetProperty("left", out var left))
        {
            if (left.TryGetProperty("accel", out var accel))
            {
                ctrl.AccelX = (float)(accel.TryGetProperty("x", out var x) ? x.GetDouble() : 0);
                ctrl.AccelY = (float)(accel.TryGetProperty("y", out var y) ? y.GetDouble() : 0);
                ctrl.AccelZ = (float)(accel.TryGetProperty("z", out var z) ? z.GetDouble() : 0);
            }
            
            if (left.TryGetProperty("gyro", out var gyro))
            {
                const float RadToDeg = 180f / MathF.PI;
                ctrl.GyroX = (float)(gyro.TryGetProperty("x", out var x) ? x.GetDouble() : 0) * RadToDeg;
                ctrl.GyroY = (float)(gyro.TryGetProperty("y", out var y) ? y.GetDouble() : 0) * RadToDeg;
                ctrl.GyroZ = (float)(gyro.TryGetProperty("z", out var z) ? z.GetDouble() : 0) * RadToDeg;
            }
            
            if (left.TryGetProperty("thumbstick", out var stick))
            {
                ctrl.LeftStickX = (byte)Math.Clamp(((float)(stick.TryGetProperty("x", out var x) ? x.GetDouble() : 0) + 1) * 127.5f, 0, 255);
                ctrl.LeftStickY = (byte)Math.Clamp(((float)(stick.TryGetProperty("y", out var y) ? y.GetDouble() : 0) + 1) * 127.5f, 0, 255);
            }
            
            if (left.TryGetProperty("trigger", out var trig))
                ctrl.AnalogL2 = (byte)(trig.GetDouble() * 255);
            if (left.TryGetProperty("grip", out var grip))
                ctrl.AnalogL1 = (byte)(grip.GetDouble() * 255);
        }
        
        if (root.TryGetProperty("right", out var right))
        {
            if (right.TryGetProperty("thumbstick", out var stick))
            {
                ctrl.RightStickX = (byte)Math.Clamp(((float)(stick.TryGetProperty("x", out var x) ? x.GetDouble() : 0) + 1) * 127.5f, 0, 255);
                ctrl.RightStickY = (byte)Math.Clamp(((float)(stick.TryGetProperty("y", out var y) ? y.GetDouble() : 0) + 1) * 127.5f, 0, 255);
            }
            
            if (right.TryGetProperty("trigger", out var trig))
                ctrl.AnalogR2 = (byte)(trig.GetDouble() * 255);
            if (right.TryGetProperty("grip", out var grip))
                ctrl.AnalogR1 = (byte)(grip.GetDouble() * 255);
        }
        
        if (root.TryGetProperty("buttons1", out var b1)) ctrl.Buttons1 = (byte)b1.GetInt32();
        if (root.TryGetProperty("buttons2", out var b2)) ctrl.Buttons2 = (byte)b2.GetInt32();
        
        UpdateVigem();
    }
    
    static void UpdateVigem()
    {
        if (Xbox360Controller == null) return;
        
        try
        {
            var c0 = Controllers[0];
            var c1 = Controllers[1];
            byte b1 = (byte)(c0.Buttons1 | c1.Buttons1);
            byte b2 = (byte)(c0.Buttons2 | c1.Buttons2);
            
            Xbox360Controller.SetButtonState(Xbox360Button.A, (b2 & 0x20) != 0);
            Xbox360Controller.SetButtonState(Xbox360Button.B, (b2 & 0x40) != 0);
            Xbox360Controller.SetButtonState(Xbox360Button.X, (b2 & 0x10) != 0);
            Xbox360Controller.SetButtonState(Xbox360Button.Y, (b2 & 0x80) != 0);
            Xbox360Controller.SetButtonState(Xbox360Button.LeftShoulder, (b2 & 0x01) != 0);
            Xbox360Controller.SetButtonState(Xbox360Button.RightShoulder, (b2 & 0x02) != 0);
            Xbox360Controller.SetButtonState(Xbox360Button.LeftThumb, (b1 & 0x02) != 0);
            Xbox360Controller.SetButtonState(Xbox360Button.RightThumb, (b1 & 0x04) != 0);
            Xbox360Controller.SetButtonState(Xbox360Button.Start, (b1 & 0x08) != 0);
            
            Xbox360Controller.SetAxisValue(Xbox360Axis.LeftThumbX, (short)((c0.LeftStickX - 128) * 256));
            Xbox360Controller.SetAxisValue(Xbox360Axis.LeftThumbY, (short)((c0.LeftStickY - 128) * 256));
            Xbox360Controller.SetAxisValue(Xbox360Axis.RightThumbX, (short)((c1.RightStickX - 128) * 256));
            Xbox360Controller.SetAxisValue(Xbox360Axis.RightThumbY, (short)((c1.RightStickY - 128) * 256));
            
            Xbox360Controller.SetSliderValue(Xbox360Slider.LeftTrigger, c0.AnalogL2);
            Xbox360Controller.SetSliderValue(Xbox360Slider.RightTrigger, c1.AnalogR2);
        }
        catch { }
    }
}

class ControllerState
{
    public byte Slot;
    public volatile bool Connected;
    public uint PacketNumber;
    public byte[] Mac;
    
    public float AccelX, AccelY, AccelZ;
    public float GyroX, GyroY, GyroZ;
    
    public byte Buttons1, Buttons2;
    public byte LeftStickX = 128, LeftStickY = 128;
    public byte RightStickX = 128, RightStickY = 128;
    
    public byte AnalogL1, AnalogR1, AnalogL2, AnalogR2;
    
    public ControllerState(byte slot)
    {
        Slot = slot;
        Mac = new byte[] { 0x00, 0x00, 0x00, 0x00, 0x00, slot };
    }
}
