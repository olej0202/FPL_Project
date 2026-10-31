import { UserDataProvider } from '../Contexts/UserContext';
import { OptimizationModelProvider } from '../Contexts/OptimizationModelContext';
import { AdjustmentDataProvider } from '../Contexts/AdjustmentsContext';
import { MyTeamDataContextProvider } from '../Contexts/MyTeamContext';
import { StatsDataProvider } from '../Contexts/StatsContext';
import { AITeamDataProvider } from '../Contexts/AITeamsContext';
import { OtherDataProvider } from '../Contexts/OtherContext';

// Provider order is intentional. Keep them above routes so plans and running
// optimizations survive navigation; MyTeam depends on user/model/adjustments.
const providers = [UserDataProvider, OptimizationModelProvider, AdjustmentDataProvider,
  MyTeamDataContextProvider, StatsDataProvider, AITeamDataProvider, OtherDataProvider];

export default function AppProviders({ children }) {
  return providers.reduceRight((content, Provider) => <Provider>{content}</Provider>, children);
}
