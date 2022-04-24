Builds off of https://github.com/renssies/homebridge-am43-blinds but in typescript instead, with some additional features, but (due to BLE differences between plaforms) it'll likely only work on Raspberry Pi (/ other linux) based homebridge instances.

# Homebridge AM43 Blinds

A homebridge plugin to control the AM43 based blind motors in HomeKit, these include the A-OK, [Zemismart](https://www.zemismart.com/products/diy-motorized-your-tranditional-roll-shade-which-with-bean-or-cord-chain-smart-home-automation-support-app-timer-remote-control), [Upndown](https://upndown.nl) and other blinds motors that use Bluetooth and the Blinds Engine app.

This Homebridge plugin uses the Bluetooth on your homebridge device to search for, and connect to the AM43 blinds via the "Blind Engine" part of the `Settings` in `homebridge-config-ui`.

# Known Issues

```
DBusError: Software caused connection abort
```

- Bluez sometimes fails on startup causing homebridge to enter a restart loop. Requires rebooting the device to fix. This used to cause the devices to be dropped from HomeKit, but I've moved when they're initialised to before the BLE connection to prevent this.

- `node-ble` doesn't support limiting discovered devices by a service UUID, I've created my [Own Fork](https://github.com/neil-morrison44/node-ble) to handle this - it definately limits the results, but I'm not sure if it only seems to work because the blinds are already connected. It's entirely possible that it won't connect to _anything_ for anyone else.
- Siri can still sometimes say `"Device is not responding"` even after the device is doing what you asked. Not sure why this happens, the connection is fast & reliable.
- Blind will report that a name change was successful but then not actually change the BLE name. ( Any user level naming should be done in the config prior to adding the blind or in HomeKit itself )
- While in the `Blind Engine` UI there can be 2 toast notification for each action, this doesn't seem to cause any errors so should be fine.

# Requirements

This plugin requires Node version 14 or newer and Homebridge version 1.3.0 or newer.
It _must_ be run on a linux system with bluez (e.g. a Raspberry PI).

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

[See the node-ble docs for more information](https://github.com/chrvadala/node-ble#provide-permissions)

# Debugging

Running homebridge with `DEBUG=AM43` should cause motor-level debug logs to be output.

So to run homebridge in debug mode use the command `DEBUG=AM43 homebridge -D` to log debug messages of the AM43 plugin. Or `DEBUG=* homebridge -D` to log messages of all plugins.

The logs can be found in `~/.homebridge` or any custom folder you've specified. They should also be available in the Homebridge Config UI (if `homebridge-config-ui-x` is installed)
