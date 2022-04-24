import React from "react"
import ReactDOM from "react-dom"
import App from "./components/app"
;(async () => {
  homebridge.addEventListener("auth-error", () => {
    homebridge.toast.error("check passcode", "Auth Error")
  })

  homebridge.addEventListener("connection-failed", (ev) => {
    const {
      data: { uuid },
    } = ev as any as { data: { uuid: string } }
    homebridge.toast.error(
      `BLE device ${uuid} non-responsive`,
      "Failed to connect"
    )
  })

  homebridge.addEventListener("auth-success", () => {
    homebridge.toast.success("Auth Success")
  })

  homebridge.addEventListener("name-change-success", () => {
    homebridge.toast.success("Name updated")
  })

  homebridge.addEventListener("limit-set-success", () => {
    homebridge.toast.warning(
      "Motor can overun until this mode's exited",
      "Limit Adjustment Mode Entered"
    )
  })

  homebridge.addEventListener("limit-cancel-success", () => {
    homebridge.toast.success("Limit Adjustment Mode Exited")
  })

  homebridge.addEventListener("limit-save-success", () => {
    homebridge.toast.success("Limit Saved!")
  })

  ReactDOM.render(
    React.createElement(App),
    document.querySelector(".am43-app-container")
  )
})()
