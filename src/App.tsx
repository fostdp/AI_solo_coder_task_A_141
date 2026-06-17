import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AppShell from "@/components/Layout/AppShell";
import Home from "@/pages/Home";
import Simulation from "@/pages/Simulation";
import Sensitivity from "@/pages/Sensitivity";
import Alerts from "@/pages/Alerts";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/simulation" element={<Simulation />} />
          <Route path="/sensitivity" element={<Sensitivity />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route
            path="*"
            element={
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="text-6xl mb-4 text-bronze-500">❖</div>
                <h2 className="font-serif text-2xl text-gold-400 mb-2 tracking-widest">
                  四 百 四
                </h2>
                <p className="text-bronze-300/80">页面不存在，请检查导航地址</p>
              </div>
            }
          />
        </Route>
      </Routes>
    </Router>
  );
}
