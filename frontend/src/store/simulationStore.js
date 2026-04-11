import { create } from 'zustand';

const useSimulationStore = create((set) => ({
  // History file state
  historyFile: null,
  stateVectors: null,
  baselineVectors: null,
  triggeredPivots: {},

  // Simulation state
  currentSimulation: null,
  simulationStatus: 'idle', // idle | configuring | running | completed | failed
  events: [],
  nashResult: null,

  // Config
  config: {
    name: '',
    rounds: 40,
    useNash: false,
  },

  // Actions
  setHistoryFile: (data) => set({
    historyFile: data,
    stateVectors: data?.initialStateVectors || null,
    baselineVectors: data?.initialStateVectors || null,
    triggeredPivots: {},
    simulationStatus: 'configuring',
  }),

  clearHistoryFile: () => set({
    historyFile: null,
    stateVectors: null,
    baselineVectors: null,
    triggeredPivots: {},
    simulationStatus: 'idle',
    nashResult: null,
  }),

  setConfig: (updates) => set((state) => ({
    config: { ...state.config, ...updates },
  })),

  setNashResult: (result) => set({ nashResult: result }),

  setCurrentSimulation: (sim) => set({
    currentSimulation: sim,
    simulationStatus: sim?.status || 'running',
  }),

  setSimulationStatus: (status) => set({ simulationStatus: status }),

  addEvent: (event) => set((state) => ({
    events: [...state.events, { ...event, id: state.events.length }],
  })),

  updateStateVectors: (vectors) => set({ stateVectors: vectors }),

  triggerPivot: (pivotId, outcomeId) => set((state) => ({
    triggeredPivots: { ...state.triggeredPivots, [pivotId]: outcomeId },
  })),

  reset: () => set({
    historyFile: null,
    stateVectors: null,
    baselineVectors: null,
    triggeredPivots: {},
    currentSimulation: null,
    simulationStatus: 'idle',
    events: [],
    nashResult: null,
    config: { name: '', rounds: 40, useNash: false },
  }),
}));

export default useSimulationStore;
