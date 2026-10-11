import "../styles/globals.css";
import { Home } from "./components/Home";
import { Interview } from "./components/Interview";
import { Result } from "./components/Result";
import { Toaster } from "sonner";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/interview/:interviewId" element={<Interview />} />
        <Route path="/result/:interviewId" element={<Result />} />
        <Route path="/result" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-center" toastOptions={{ className: "rounded-2xl! border-stone! font-body!" }} />
    </BrowserRouter>
  );
}

export default App;
