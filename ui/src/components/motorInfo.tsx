import React, { Fragment, useEffect, useState } from "react"
import { useHomebridgeConfig } from "../hooks/useHomebridgeConfig"
import SetLimit from "./setLimit"
import MotorIcon from "./motorIcon"
import { DeviceObject } from "../../types"
import { AM43Config, PerDeviceConfig } from "../../../lib/types"

export const MotorInfo = ({ device }: { device: DeviceObject }) => {
  const [newName, setNewName] = useState<string>(device.name)
  const { config, updateConfig } = useHomebridgeConfig<AM43Config>()
  const [hasAuthed, setHasAuthed] = useState(false)
  const [limitUI, setLimitUI] = useState<null | "OPENED" | "CLOSED">(null)
  const allowedDevices = config?.allowed_devices || []

  const deviceConfig: PerDeviceConfig | undefined = allowedDevices.find(
    ({ address }) => address.toUpperCase() === device?.address.toUpperCase()
  )

  const [passcode, setPasscode] = useState<string>(
    deviceConfig?.pass_code ?? "8888"
  )

  const removeFromAllowedDevices = async () => {
    await updateConfig({
      ...config,
      allowed_devices: allowedDevices.filter(
        ({ address }) => address !== device.address
      ),
    })
  }

  const addToAllowedDevices = async () => {
    await updateConfig({
      ...config,
      allowed_devices: [
        ...allowedDevices,
        { name: newName, address: device.address, has_tilt: false },
      ],
    })
  }

  useEffect(() => {
    const setAuthTrue = (ev) => {
      if (ev.data.device_id === device.address) setHasAuthed(true)
    }
    homebridge.addEventListener("auth-success", setAuthTrue)
    return () => homebridge.removeEventListener("auth-success", setAuthTrue)
  }, [])

  const submitNewName = async () => {
    homebridge.request("/rename_device", {
      device_id: device.address,
      new_name: newName,
    })
  }

  const submitPassCode = () => {
    homebridge.request("/auth_with_passcode", {
      device_id: device.address,
      passcode,
    })
  }

  return (
    <div className="card-body d-flex">
      <div className="mr-3">
        <MotorIcon />
      </div>
      {device && (
        <div className="w-100">
          <div className="input-group mb-3">
            <div className="input-group-prepend">
              <span className="input-group-text" id="motor-name">
                Name
              </span>
            </div>
            <input
              value={newName}
              disabled={!hasAuthed}
              onChange={({ target }) => setNewName(target.value)}
              type="text"
              className="form-control"
              placeholder="Motor Name"
              aria-label="local name"
              aria-describedby="motor-name"
            />
            {device.name !== newName && newName?.length > 0 && (
              <div className="input-group-append">
                <button
                  type="button"
                  onClick={submitNewName}
                  className="btn-outline-secondary"
                >
                  Update
                </button>
              </div>
            )}
          </div>

          <div className="input-group mb-3">
            <div className="input-group-prepend">
              <span className="input-group-text" id="motor-address">
                Address
              </span>
            </div>
            <input
              value={device.address}
              type="text"
              disabled
              className="form-control"
              aria-label="local name"
              aria-describedby="motor-address"
            />
          </div>
          {!hasAuthed && (
            <div className="input-group mb-3">
              <div className="input-group-prepend">
                <span className="input-group-text" id="passcode-label">
                  Passcode
                </span>
              </div>
              <input
                value={passcode}
                pattern="[0-9]{4}"
                onChange={({ target }) => setPasscode(target.value)}
                type="text"
                className="form-control"
                placeholder="(default 8888)"
                aria-label="passcode"
                aria-describedby="passcode-label"
              />
              <div className="input-group-append">
                <button
                  type="button"
                  onClick={submitPassCode}
                  className="btn-outline-secondary"
                >
                  Auth
                </button>
              </div>
            </div>
          )}
          {hasAuthed && (
            <Fragment>
              <div className="card border-light mb-3">
                <button
                  type="button"
                  onClick={() =>
                    setLimitUI((l) => (l === null ? "OPENED" : null))
                  }
                  className="card-header btn btn-outline-secondary btn-sm m-0"
                >
                  Set Open Limit
                </button>
                {limitUI === "OPENED" && (
                  <SetLimit
                    openOrClose={limitUI}
                    deviceId={device.address}
                    onClose={() => setLimitUI(null)}
                  />
                )}
              </div>
              <div className="card border-light mb-3">
                <button
                  type="button"
                  onClick={() =>
                    setLimitUI((l) => (l === null ? "CLOSED" : null))
                  }
                  className="card-header btn btn-outline-secondary btn-sm m-0"
                >
                  Set Close Limit
                </button>
                {limitUI === "CLOSED" && (
                  <SetLimit
                    openOrClose={limitUI}
                    deviceId={device.address}
                    onClose={() => setLimitUI(null)}
                  />
                )}
              </div>
            </Fragment>
          )}
          {config && (
            <button
              type="button"
              className={`btn ${deviceConfig ? "btn-danger" : "btn-secondary"}`}
              onClick={
                deviceConfig ? removeFromAllowedDevices : addToAllowedDevices
              }
            >
              {deviceConfig ? "Remove from" : "Add to"} Allowed List (on save)
            </button>
          )}
        </div>
      )}
      {!device && (
        <div>
          <div className="alert alert-secondary" role="alert">
            Attempting to connect to motor...
          </div>
        </div>
      )}
    </div>
  )
}
