import "../styles/globals.css";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Form } from "@/components/Form";
import { Interview } from "@/components/Interview";
import { Result } from "@/components/Result";
import { Toaster } from "sonner";
import {BrowserRouter, Routes, Route} from "react-router-dom";

export function App() {
  const [page, setPage] = useState<"form" | "interview" | "result">("form");
  
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Form />} />
        <Route path="/interview/:id" element={<Interview />} />
        <Route path="/result/:id" element={<Result />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;
