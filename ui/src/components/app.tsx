import React, { useState, useEffect } from "react"
import DeviceList from "./deviceList"
import { MotorInfo } from "./motorInfo"
import BreadCrumbs from "./breadCrumbs"
import { WaitForDevice } from "./waitForDevice"

const App = () => {
  const [inBlindEngineMode, setInBlindEngineMode] = useState(false)
  useEffect(() => {
    if (inBlindEngineMode) {
      homebridge.hideSchemaForm()
    } else {
      homebridge.showSchemaForm()
    }
  }, [inBlindEngineMode])

  const [selectedDeviceId, setSelectedDeviceId] = useState(null)

  const onExit = () => {
    setSelectedDeviceId(null)
    setInBlindEngineMode(false)
  }

  if (inBlindEngineMode) {
    return (
      <div className="card">
        <BreadCrumbs
          selectedDeviceId={selectedDeviceId}
          onExitBlindsEngineMode={onExit}
          onReturnToDeviceList={() => setSelectedDeviceId(null)}
        />
        {selectedDeviceId !== null ? (
          <WaitForDevice deviceId={selectedDeviceId}>
            {(device) => <MotorInfo device={device} />}
          </WaitForDevice>
        ) : (
          <DeviceList onSelect={(id) => setSelectedDeviceId(id)} />
        )}
      </div>
    )
  }

  return (
    <div className="d-flex justify-content-center">
      <button
        type="button"
        className="btn btn-primary w-75"
        onClick={() => setInBlindEngineMode(true)}
      >
        Blind Engine
      </button>
    </div>
  )
}

export default App
