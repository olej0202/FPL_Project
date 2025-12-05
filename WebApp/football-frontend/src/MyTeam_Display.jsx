import React, { useState, useEffect, useMemo } from 'react';
import { useMyteamData } from './Contexts/MyTeamContext';
import { useStatsData } from './Contexts/StatsContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';

export default function MyTeamOverview() {
  const { teamId, setTeamId, teamData, fetchMyTeam, teamLoading } = useMyteamData();
  const { PlayersData } = useStatsData();
  
  const [localTeamId, setLocalTeamId] = useState(teamId || '');
  const [showChart, setShowChart] = useState(false);
  const [currentGW, setCurrentGW] = useState(null);

  // Fetch team data when component mounts or teamId changes
  useEffect(() => {
    if (teamId && !teamData) {
      fetchMyTeam();
    }
  }, [teamId]);

  // Get available GWs and set initial GW
  const availableGWs = useMemo(() => {
    if (!PlayersData || !Array.isArray(PlayersData) || PlayersData.length === 0) return [];
    const gws = [...new Set(PlayersData.map(p => p.GW))].sort((a, b) => a - b);
    return gws;
  }, [PlayersData]);

  useEffect(() => {
    if (availableGWs.length > 0 && currentGW === null) {
      setCurrentGW(availableGWs[0]);
    }
  }, [availableGWs]);

  // Prepare chart data from rank_progress
  const chartData = useMemo(() => {
    if (!teamData || !teamData[0]?.rank_progress) return [];
    return teamData[0].rank_progress.map((rank, index) => ({
      gw: index + 1,
      rank: rank
    }));
  }, [teamData]);

  // Get team info from first row
  const teamInfo = teamData?.[0] || {};
  const moneyInBank = teamInfo.money_in_bank_m || 0;
  const savedTransfers = teamInfo.saved_transfers || 0;

  // Position order for sorting
  const positionOrder = { 'GKP': 1, 'DEF': 2, 'MID': 3, 'FWD': 4 };

  // Merge team data with player predictions for current GW
  const playersWithPredictions = useMemo(() => {
    if (!teamData || !Array.isArray(teamData) || !PlayersData || !Array.isArray(PlayersData) || currentGW === null) return [];
    
    return teamData
      .map(player => {
        const prediction = PlayersData.find(
          p => p.name === player.player_name && p.GW === currentGW
        );
        
        return {
          ...player,
          points_prediction: prediction?.Points_prediction || 0,
          opponent: prediction?.opponent_name || 'N/A'
        };
      })
      .sort((a, b) => {
        const posA = positionOrder[a.position] || 999;
        const posB = positionOrder[b.position] || 999;
        return posA - posB;
      });
  }, [teamData, PlayersData, currentGW]);

  const handleSetTeamId = () => {
    if (!localTeamId) {
      alert('Please enter a Team ID');
      return;
    }
    setTeamId(localTeamId);
    fetchMyTeam();
  };

  const handlePrevGW = () => {
    const currentIndex = availableGWs.indexOf(currentGW);
    if (currentIndex > 0) {
      setCurrentGW(availableGWs[currentIndex - 1]);
    }
  };

  const handleNextGW = () => {
    const currentIndex = availableGWs.indexOf(currentGW);
    if (currentIndex < availableGWs.length - 1) {
      setCurrentGW(availableGWs[currentIndex + 1]);
    }
  };

  // If no teamId set, show input
  if (!teamId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-8">
        <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">Enter Your Team ID</h1>
          <input
            type="text"
            value={localTeamId}
            onChange={(e) => setLocalTeamId(e.target.value)}
            placeholder="Team ID"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={handleSetTeamId}
            className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition"
          >
            Load Team
          </button>
        </div>
      </div>
    );
  }

  if (teamLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading team data...</div>
      </div>
    );
  }

  if (!teamData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">No team data available</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <h1 className="text-3xl font-bold text-gray-800 mb-8">My Team Overview</h1>

        {/* Overview Section */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Team Stats</h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Money in Bank</div>
              <div className="text-2xl font-bold text-green-600">£{moneyInBank.toFixed(1)}m</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Saved Transfers</div>
              <div className="text-2xl font-bold text-blue-600">{savedTransfers}</div>
            </div>
          </div>
        </div>

        {/* Season History Chart */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <button
            onClick={() => setShowChart(!showChart)}
            className="flex items-center justify-between w-full text-left"
          >
            <h2 className="text-xl font-semibold text-gray-800">Season History</h2>
            {showChart ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
          </button>
          
          {showChart && chartData.length > 0 && (
            <div className="mt-6" style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="gw" label={{ value: 'Gameweek', position: 'insideBottom', offset: -5 }} />
                  <YAxis reversed label={{ value: 'Rank', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="rank" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* GW Navigation */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-800">Squad for GW {currentGW}</h2>
            <div className="flex items-center gap-4">
              <button
                onClick={handlePrevGW}
                disabled={availableGWs.indexOf(currentGW) === 0}
                className="p-2 rounded-lg bg-purple-100 text-purple-600 hover:bg-purple-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-sm font-medium text-gray-600">
                GW {currentGW}
              </span>
              <button
                onClick={handleNextGW}
                disabled={availableGWs.indexOf(currentGW) === availableGWs.length - 1}
                className="p-2 rounded-lg bg-purple-100 text-purple-600 hover:bg-purple-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          {/* Players List */}
          <div className="space-y-3">
            {playersWithPredictions.map((player, idx) => (
              <div
                key={idx}
                className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
              >
                <img
                  src={player.photo}
                  alt={player.web_name}
                  className="w-16 h-16 rounded-full object-cover bg-gray-200"
                  onError={(e) => { e.target.src = 'https://via.placeholder.com/64'; }}
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">{player.web_name}</div>
                  <div className="text-sm text-gray-600">{player.team} • {player.position}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">Selected by</div>
                  <div className="font-semibold text-gray-800">{player.selected_by_precent}%</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">vs {player.opponent}</div>
                  <div className="font-bold text-purple-600 text-lg">{player.points_prediction.toFixed(1)} pts</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}