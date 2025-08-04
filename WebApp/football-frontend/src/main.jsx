import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { BrowserRouter,HashRouter  } from 'react-router-dom'
import './index.css'; // or './tailwind.css' or similar
import { AITeamDataProvider } from "./Contexts/AITeamsContext";
import {OtherDataProvider} from "./Contexts/OtherContext";
import {StatsDataProvider} from "./Contexts/StatsContext";
import {MyTeamDataContextProvider} from "./Contexts/MyTeamContext";

ReactDOM.createRoot(document.getElementById('root')).render(
  <HashRouter >
  <MyTeamDataContextProvider>
  <StatsDataProvider>
    <AITeamDataProvider>
      <OtherDataProvider>
        <App />
      </OtherDataProvider>
    </AITeamDataProvider>
  </StatsDataProvider>
  </MyTeamDataContextProvider>
  
  </HashRouter >
  
)


