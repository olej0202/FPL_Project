import React, { useState } from 'react';
import { ArrowRightLeft, X } from 'lucide-react';
import pitch from '../assets/Pitch4.png';

export default function TreeNodePitch({ rows, gw, expanded = false, onSelect, onTransfer, onSwap, onPlayerDetails, onBan, bannedList, getPhoto, getName, getDisplayName, getValue, getOpponent, formatValue, canSwap, onLoadTeam, teamLoading = false, teamError, hasTeamId = false }) {
  const [draggedName, setDraggedName] = useState('');
  const starters = rows.filter((row) => row.status === 'playing');
  const bench = rows
    .filter((row) => row.status === 'benched')
    .sort((a, b) => Number(b.position === 'GKP') - Number(a.position === 'GKP'));
  const renderPlayers = (players) => (
    <div className={`flex items-start justify-center ${expanded ? 'gap-2 sm:gap-6' : 'gap-1'}`}>
      {players.map((player) => {
        const name = getName(player);
        const allowed = draggedName && canSwap(rows, draggedName, name);
        const opponent = getOpponent(player);
        return (
          <div key={name} className={`relative min-w-0 flex-1 text-center ${expanded ? 'max-w-[128px]' : 'max-w-[72px]'}`} draggable
            onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('text/plain', name); setDraggedName(name); onSelect(); }}
            onDragEnd={() => setDraggedName('')}
            onDragOver={(event) => { if (allowed) event.preventDefault(); }}
            onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (allowed) onSwap(event.dataTransfer.getData('text/plain'), name); setDraggedName(''); }}
            style={{ outline: allowed ? '2px solid #16a34a' : 'none', borderRadius: 8 }}>
            {player.Is_captain && <span className="absolute left-1 top-2 z-10 rounded-full bg-emerald-800 px-1 text-[9px] font-bold text-white">C</span>}
            <button type="button" onClick={() => { onSelect(); onPlayerDetails(player); }} className="w-full" title={`View ${getDisplayName(player)}`}>
              <span className={`relative mx-auto block max-w-full ${expanded ? 'h-[clamp(48px,8vw,96px)] w-[clamp(48px,8vw,96px)]' : 'h-10 w-10'}`}>
                <img draggable={false} src={getPhoto(player)} alt={getDisplayName(player)} className="h-full w-full object-contain"
                  style={{ clipPath: 'polygon(0 0, 100% 0, 100% 50%, 0 100%)' }} />
                <span className={`absolute bottom-[4%] right-[10%] max-w-[65%] truncate font-bold leading-none tabular-nums text-slate-900 ${expanded ? 'text-[clamp(12px,1.7vw,20px)]' : 'text-[11px]'}`}>
                  {formatValue(getValue(player))}
                </span>
              </span>
              <span className={`block truncate rounded bg-slate-900/90 px-1 py-0.5 font-semibold text-white ${expanded ? 'text-[10px] sm:text-xs' : 'text-[9px]'}`}>{getDisplayName(player)}</span>
              <span className={`block truncate rounded bg-white/80 text-slate-700 ${expanded ? 'text-[9px] sm:text-xs' : 'text-[8px]'}`} title={opponent.full}>{opponent.display}{opponent.venue ? ` (${opponent.venue})` : ''}</span>
            </button>
            <button type="button" onClick={() => onTransfer(player)} className="absolute -right-1 top-7 rounded-full border bg-white p-0.5 text-emerald-800" aria-label={`Transfer out ${getDisplayName(player)}`} title="Plan transfer"><ArrowRightLeft size={10} /></button>
            <button type="button" onClick={() => onBan(name)} className={`absolute -right-1 top-0 rounded-full bg-white p-0.5 ${bannedList?.includes(name) ? 'text-red-600' : 'text-slate-500'}`} aria-label={`Toggle unwanted for ${getDisplayName(player)}`}><X size={9} /></button>
          </div>
        );
      })}
    </div>
  );
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-cover bg-center p-2" style={{ backgroundImage: `url(${pitch})`, backgroundSize: '100% 100%', height: expanded ? 'clamp(650px,80vw,900px)' : 550 }} aria-label={`Pitch GW${gw}`}>
      {rows.length ? <>
        <div className="grid grid-rows-4 items-center gap-1" style={{ height: expanded ? 'clamp(480px,60vw,680px)' : 390 }}>
          {['GKP', 'DEF', 'MID', 'FWD'].map((position) => <div key={position}>{renderPlayers(starters.filter((row) => row.position === position))}</div>)}
        </div>
        <div className="mt-1 rounded-lg bg-white/60 p-1">
          <div className="text-center text-[8px] font-semibold uppercase text-slate-600">Bench</div>
          {renderPlayers(bench)}
        </div>
      </> : <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <button type="button" onClick={onLoadTeam} disabled={teamLoading || !hasTeamId}
          className="gold-ring rounded-2xl border border-slate-200 bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-900 shadow-md disabled:cursor-not-allowed disabled:opacity-60"
          title={!hasTeamId ? 'Enter your Team ID at the top of the page' : undefined}
          aria-busy={teamLoading}>
          {teamLoading ? 'Loading…' : 'Load team'}
        </button>
        {teamError && <p role="alert" className="max-w-xs rounded-lg bg-white/90 px-3 py-2 text-xs text-rose-700">{teamError}</p>}
      </div>}
    </div>
  );
}
