async function checkServer() {
  const statusEl = document.getElementById("server-status")
  const dotEl = document.getElementById("status-dot")

  try {
    const res = await fetch("https://rikaaaaaa-promptly.hf.space/health")
    const data = await res.json()

    dotEl.style.background = "#2d9e4f"
    statusEl.textContent = "DSPy server running"

  } catch {
    dotEl.style.background = "#c0392b"
    statusEl.innerHTML =
      "Server not running<br>" +
      "<code style='font-size:10px'>" +
      "cd promptly/dspy-server<br>" +
      "uvicorn server:app --port 8000" +
      "</code>"
  }
}

document.addEventListener("DOMContentLoaded", checkServer)
