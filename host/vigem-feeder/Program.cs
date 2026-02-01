using System.Text.Json;
using Nefarius.ViGEm.Client;
using Nefarius.ViGEm.Client.Targets;
using Nefarius.ViGEm.Client.Targets.Xbox360;

class Program
{
    static ViGEmClient? client;
    static IXbox360Controller? controller;
    static bool running = true;

    static void Main(string[] args)
    {
        Console.Error.WriteLine("ViGEm Feeder starting...");
        
        try
        {
            Console.Error.WriteLine("Creating ViGEm client...");
            client = new ViGEmClient();
            Console.Error.WriteLine("ViGEm client created successfully");
            
            Console.Error.WriteLine("Creating Xbox 360 controller...");
            controller = client.CreateXbox360Controller();
            Console.Error.WriteLine("Controller created, connecting...");
            
            controller.Connect();
            Console.Error.WriteLine("Virtual Xbox 360 controller connected!");
            Console.WriteLine("READY");
            Console.Out.Flush();
        }
        catch (Nefarius.ViGEm.Client.Exceptions.VigemBusNotFoundException ex)
        {
            Console.Error.WriteLine($"ViGEm Bus driver not found: {ex.Message}");
            Console.WriteLine("ERROR:ViGEmBus driver not installed");
            Console.Out.Flush();
            return;
        }
        catch (Nefarius.ViGEm.Client.Exceptions.VigemBusAccessFailedException ex)
        {
            Console.Error.WriteLine($"Cannot access ViGEm Bus: {ex.Message}");
            Console.WriteLine("ERROR:Cannot access ViGEmBus - try running as Administrator");
            Console.Out.Flush();
            return;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Failed to create controller: {ex.GetType().Name}: {ex.Message}");
            Console.WriteLine("ERROR:" + ex.Message);
            Console.Out.Flush();
            return;
        }

        // Read JSON input lines from stdin
        while (running)
        {
            try
            {
                string? line = Console.ReadLine();
                if (line == null)
                {
                    running = false;
                    break;
                }

                if (line == "QUIT")
                {
                    running = false;
                    break;
                }

                ProcessInput(line);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Error: {ex.Message}");
            }
        }

        controller?.Disconnect();
        client?.Dispose();
        Console.Error.WriteLine("ViGEm Feeder stopped.");
    }

    static void ProcessInput(string json)
    {
        if (controller == null) return;

        try
        {
            var data = JsonSerializer.Deserialize<ControllerInput>(json);
            if (data == null) return;

            // Face buttons (using DSU bit layout)
            // buttons2: Y(7), B(6), A(5), X(4), R1(3), L1(2), R2(1), L2(0)
            controller.SetButtonState(Xbox360Button.Y, (data.buttons2 & 0x80) != 0);
            controller.SetButtonState(Xbox360Button.B, (data.buttons2 & 0x40) != 0);
            controller.SetButtonState(Xbox360Button.A, (data.buttons2 & 0x20) != 0);
            controller.SetButtonState(Xbox360Button.X, (data.buttons2 & 0x10) != 0);
            controller.SetButtonState(Xbox360Button.RightShoulder, (data.buttons2 & 0x08) != 0);
            controller.SetButtonState(Xbox360Button.LeftShoulder, (data.buttons2 & 0x04) != 0);

            // buttons1: DPadLeft(7), DPadDown(6), DPadRight(5), DPadUp(4), Options(3), R3(2), L3(1), Share(0)
            controller.SetButtonState(Xbox360Button.Left, (data.buttons1 & 0x80) != 0);
            controller.SetButtonState(Xbox360Button.Down, (data.buttons1 & 0x40) != 0);
            controller.SetButtonState(Xbox360Button.Right, (data.buttons1 & 0x20) != 0);
            controller.SetButtonState(Xbox360Button.Up, (data.buttons1 & 0x10) != 0);
            controller.SetButtonState(Xbox360Button.Start, (data.buttons1 & 0x08) != 0);
            controller.SetButtonState(Xbox360Button.RightThumb, (data.buttons1 & 0x04) != 0);
            controller.SetButtonState(Xbox360Button.LeftThumb, (data.buttons1 & 0x02) != 0);
            controller.SetButtonState(Xbox360Button.Back, (data.buttons1 & 0x01) != 0);

            // Triggers (0-255 -> 0-255)
            controller.SetSliderValue(Xbox360Slider.LeftTrigger, (byte)data.leftTrigger);
            controller.SetSliderValue(Xbox360Slider.RightTrigger, (byte)data.rightTrigger);

            // Sticks (0-255, 128=center -> -32768 to 32767)
            controller.SetAxisValue(Xbox360Axis.LeftThumbX, ConvertStick(data.leftStickX));
            controller.SetAxisValue(Xbox360Axis.LeftThumbY, ConvertStick(data.leftStickY));
            controller.SetAxisValue(Xbox360Axis.RightThumbX, ConvertStick(data.rightStickX));
            controller.SetAxisValue(Xbox360Axis.RightThumbY, ConvertStick(data.rightStickY));

            controller.SubmitReport();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Parse error: {ex.Message}");
        }
    }

    static short ConvertStick(int value)
    {
        // Convert 0-255 (128 center) to -32768 to 32767
        int centered = value - 128;
        return (short)(centered * 257);
    }
}

class ControllerInput
{
    public int buttons1 { get; set; }
    public int buttons2 { get; set; }
    public int leftStickX { get; set; } = 128;
    public int leftStickY { get; set; } = 128;
    public int rightStickX { get; set; } = 128;
    public int rightStickY { get; set; } = 128;
    public int leftTrigger { get; set; }
    public int rightTrigger { get; set; }
}
