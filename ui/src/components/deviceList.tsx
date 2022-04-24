import React, { useState, useEffect, useCallback } from "react"
import { DeviceObject } from "../../types"
import MotorIcon from "./motorIcon"

const DeviceList = ({ onSelect }) => {
  const [devices, setDevices] = useState<DeviceObject[]>([])
  const scanForDevices = useCallback(() => {
    setDevices([])
    homebridge.showSpinner()
    homebridge
      .request("/scan_for_devices", { scan_time: 10e3 })
      .then((scanResults) => {
        homebridge.hideSpinner()
        setDevices(scanResults)
      })
  }, [])

  return (
    <div className="card-body">
      <ol className="list-group">
        {devices.map(({ address, name }) => (
          <button
            className="list-group-item list-group-item-action d-flex flex-row"
            key={address}
            onClick={() => onSelect(address)}
          >
            <div className="mr-4">
              <MotorIcon small />
            </div>
            <div>
              <h5>{name}</h5>
              <p>{address}</p>
            </div>
          </button>
        ))}
      </ol>
      <div className="d-flex flex-column align-items-center">
        <button
          type="button"
          className="btn btn-primary w-100"
          onClick={scanForDevices}
        >
          Scan For Devices
        </button>
      </div>
    </div>
  )
}

export default DeviceList
