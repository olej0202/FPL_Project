import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { BrowserRouter } from 'react-router-dom'
import './index.css'; // or './tailwind.css' or similar
import { AITeamDataProvider } from "./Contexts/AITeamsContext";
import {OtherDataProvider} from "./Contexts/OtherContext";
import {StatsDataProvider} from "./Contexts/StatsContext";

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
  <StatsDataProvider>
    <AITeamDataProvider>
      <OtherDataProvider>
        <App />
      </OtherDataProvider>
    </AITeamDataProvider>
  </StatsDataProvider>
  
  </BrowserRouter>
)


