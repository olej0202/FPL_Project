import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { BrowserRouter } from 'react-router-dom'
import './index.css'; // or './tailwind.css' or similar
import { AITeamDataProvider } from "./Contexts/AITeamsContext";
import {OtherDataProvider} from "./Contexts/OtherContext";

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AITeamDataProvider>
      <OtherDataProvider>
        <App />
      </OtherDataProvider>
    </AITeamDataProvider>
  
  </BrowserRouter>
)


