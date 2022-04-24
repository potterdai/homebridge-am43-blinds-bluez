Builds off of https://github.com/renssies/homebridge-am43-blinds but in typescript instead, with some additional features, but (due to BLE differences between plaforms) it'll likely only work on Raspberry Pi based homebridge instances.

# Homebridge AM43 Blinds

A homebridge plugin to control the AM43 based blind motors in HomeKit, these include the A-OK, [Zemismart](https://www.zemismart.com/products/diy-motorized-your-tranditional-roll-shade-which-with-bean-or-cord-chain-smart-home-automation-support-app-timer-remote-control), [Upndown](https://upndown.nl) and other blinds motors that use Bluetooth and the Blinds Engine app.

This Homebridge plugin uses the Bluetooth on your computer to search for, and connect to the AM43 blinds.

# Requirements

This plugin requires Node version 14 or newer and Homebridge version 0.4.46 or newer. Homebridge version 1.0 is recommended.

It also requires that the machine that hosts Homebridge has a Bluetooth radio that supports the Bluetooth Low Energy (BLE) protocol. Most machines with Bluetooth 4.0 or newer support this protocol. This includes Macs (that support AirDrop) and Raspberry Pi version 3 or newer. Some systems might also work with an external Bluetooth 4.0 USB adapter. For compatibility check the [noble package](https://github.com/abandonware/noble) that is used by this plugin.

Bluetooth adapters with the CSR8510 chipset are supported by most systems, including Raspberry Pi with Raspberry Pi OS.

# Installation

Before installing set up node-ble by creating the following file in `/etc/dbus-1/system.d/node-ble.conf` (assuming that your homebridge instance is run as `homebridge`)

```xml
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-BUS Bus Configuration 1.0//EN"
  "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <policy user="homebridge">
   <allow own="org.bluez"/>
    <allow send_destination="org.bluez"/>
    <allow send_interface="org.bluez.GattCharacteristic1"/>
    <allow send_interface="org.bluez.GattDescriptor1"/>
    <allow send_interface="org.freedesktop.DBus.ObjectManager"/>
    <allow send_interface="org.freedesktop.DBus.Properties"/>
  </policy>
</busconfig>
```

# Debugging

Running homebridge with `DEBUG=AM43` should cause motor-level debug logs to be output.

So to run homebridge in debug mode use the command `DEBUG=AM43 homebridge -D` to log debug messages of the AM43 plugin. Or `DEBUG=* homebridge -D` to log messages of all plugins.

The logs can be found in `~/.homebridge` or any custom folder you've specified. They should also be available in the Homebridge Config UI (if `homebridge-config-ui-x` is installed)
