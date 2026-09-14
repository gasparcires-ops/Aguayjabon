import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Catalogo from "./Catalogo.jsx";
import "./index.css";

const esCatalogo = window.location.pathname.replace(/\/+$/, "") === "/catalogo";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {esCatalogo ? <Catalogo /> : <App />}
  </React.StrictMode>
);
