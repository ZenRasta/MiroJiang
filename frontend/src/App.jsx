import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import SetupPage from './pages/SetupPage';
import SimulationWorkspace from './pages/SimulationWorkspace';

export default function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <div style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/simulate" element={<SetupPage />} />
          <Route path="/simulate/:simId" element={<SimulationWorkspace />} />
        </Routes>
      </div>
    </div>
  );
}
