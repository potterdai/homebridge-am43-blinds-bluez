import React, { ReactNode, useEffect, useState } from "react"
import { DeviceObject } from "../../types"

type WaitForDeviceProps = {
  deviceId: string
  children: (DeviceObject) => ReactNode
}

export const WaitForDevice = ({ deviceId, children }: WaitForDeviceProps) => {
  const [device, setDevice] = useState<DeviceObject | null>(null)
  useEffect(() => {
    homebridge.showSpinner()
    homebridge
      .request("/connect_to_device", { device_id: deviceId })
      .then((deviceResult: DeviceObject) => {
        homebridge.hideSpinner()
        setDevice(deviceResult)
      })

    return () => {
      homebridge.request("/disconnect_from_device", { device_id: deviceId })
    }
  }, [])
  if (!device) return null
  return <>{children(device)}</>
}
