<p align="center">
  <img src="Gemini_Generated_Image_rvnb72rvnb72rvnb.png" alt="MiroJiang — Predictive History Simulation Engine" width="100%">
</p>

<h1 align="center">MiroJiang</h1>
<p align="center"><strong>Predictive History Simulation Engine</strong></p>
<p align="center">
  Counterfactual historical analysis powered by the Jiang Xueqin Predictive History framework and <a href="https://github.com/666ghj/MiroFish">MiroFish</a> agent-based simulation.
</p>

---

## Overview

MiroJiang is an interactive platform for conducting **counterfactual historical analysis** — exploring how different decisions at critical moments could have reshaped geopolitical outcomes. It is built on two foundations:

### The Jiang Xueqin Predictive History Framework

Professor Jiang's framework provides a structured methodology for analyzing "what-if" scenarios in history. Rather than treating history as a fixed sequence of events, the framework models it through four analytical lenses:

- **Four-Dimensional State Vectors** — Every actor (nation, organization, leader) is tracked across four dimensions scored from -100 to +100:
  - **NARRATIVE**: Soft power, legitimacy, public opinion, media narrative control
  - **POLITICAL**: Alliance strength, elite cohesion, institutional stability, diplomatic leverage
  - **ECONOMIC**: Resource access, trade flows, sanctions exposure, financial resilience
  - **MILITARY**: Force projection, asymmetric capability, logistics readiness, morale

- **Structural Historical Analogies** — Scenarios are mapped against historical precedents. When a current situation mirrors a past pattern (e.g., "Thucydides Trap," "Cuban Missile Crisis escalation ladder"), the framework weights projections toward that pattern's known outcome — unless current state vectors indicate the pattern is breaking.

- **Game-Theoretic Reasoning** — At each pivot point, actors' choices are evaluated through payoff matrices and Nash equilibrium analysis. Actors deviate from the "rational" choice only when their NARRATIVE or POLITICAL scores suggest domestic constraints override strategic logic.

- **Pivot Point Analysis** — History is modeled as a series of critical decision junctures. Each pivot point has a baseline outcome (what actually happened) and one or more counterfactual alternate outcomes. Injecting an alternate outcome cascades state vector changes across all actors, producing a divergent timeline.

### MiroFish Integration

[MiroFish](https://github.com/666ghj/MiroFish) is a separate agent-based simulation engine that brings scenarios to life. MiroJiang acts as the orchestration and analysis layer on top of MiroFish:

1. **MiroJiang** converts the history file into a knowledge graph and simulation requirement
2. **MiroFish** generates agent profiles, behavioral constraints, and runs multi-round simulations where agents take autonomous actions
3. **MiroJiang** tracks state vectors, enables counterfactual injection during simulation, and produces divergence analysis reports

The two systems work in tandem — MiroJiang provides the historical framework, UI, and counterfactual analysis tools, while MiroFish provides the agent simulation engine.

---

## Features

- **History File Builder** — Interactive LLM-guided conversation to construct scenario files from scratch, or generate them from web search results
- **Counterfactual Injection** — Inject alternate outcomes at pivot points during live simulation and watch the timeline diverge
- **Real-Time State Tracking** — Monitor all actors' four-dimensional state vectors as the simulation progresses
- **Nash Equilibrium Analysis** — Compute game-theoretic equilibria for actor decisions at pivot points
- **Divergence Reports** — Generate detailed reports comparing the counterfactual timeline against the baseline
- **Live Simulation Streaming** — Server-Sent Events (SSE) provide real-time progress updates and agent actions
- **Dashboard** — Manage multiple simulations with filtering, status tracking, and deletion

---

## Prerequisites

- **Python 3.9+**
- **Node.js 18+**
- **MiroFish** running locally (default: `http://localhost:5001`) — see [MiroFish setup](https://github.com/666ghj/MiroFish)
- **API Keys:**
  - [OpenRouter](https://openrouter.ai/) — LLM calls (default model: `deepseek/deepseek-chat`)
  - [Tavily](https://tavily.com/) — Web search for history file generation (optional but recommended)

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/ZenRasta/MiroJiang.git
cd MiroJiang
```

### 2. Set up the Python backend

```bash
python -m venv .venv
source .venv/bin/activate        # Linux/macOS
# .venv\Scripts\activate         # Windows

pip install -r backend/requirements.txt
```

### 3. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### 4. Configure environment variables

Create a `.env` file in the project root:

```env
LLM_API_KEY=<your OpenRouter API key>
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL_NAME=deepseek/deepseek-chat
DATABASE_URL=sqlite:///./mirojiang.db
TAVILY_API_KEY=<your Tavily API key>
```

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_API_KEY` | Yes | OpenRouter API key for LLM calls |
| `LLM_BASE_URL` | Yes | LLM provider base URL |
| `LLM_MODEL_NAME` | Yes | Model identifier (e.g., `deepseek/deepseek-chat`) |
| `DATABASE_URL` | Yes | SQLite connection string |
| `TAVILY_API_KEY` | No | Tavily API key for web search features |

---

## Running

### Quick start

```bash
chmod +x start.sh
./start.sh
```

This launches both servers:
- **Backend**: http://localhost:8100
- **Frontend**: http://localhost:3100
- **API Docs**: http://localhost:8100/docs (Swagger UI)

### Manual start

**Terminal 1 — Backend:**
```bash
source .venv/bin/activate
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8100 --reload
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 3100
```

### MiroFish

MiroFish must be running for simulations to execute. By default, MiroJiang connects to `http://localhost:5001/api`. See the [MiroFish repository](https://github.com/666ghj/MiroFish) for setup instructions.

---

## The History File

The **History File** is the core data structure that drives every simulation. It is a JSON document that encodes a counterfactual scenario according to Professor Jiang's framework.

### Structure

```json
{
  "title": "Scenario title",
  "period": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "description": "Multi-paragraph scenario overview",

  "baselineTimeline": [
    {
      "date": "YYYY-MM-DD",
      "description": "What actually happened",
      "dimensionsAffected": ["NARRATIVE", "POLITICAL", "ECONOMIC", "MILITARY"]
    }
  ],

  "pivotPoints": [
    {
      "id": "pp_descriptive_name",
      "date": "YYYY-MM-DD",
      "description": "The decision or event",
      "counterfactualPrompt": "The 'what if' question",
      "defaultOutcome": "What actually happened (baseline)",
      "alternateOutcomes": [
        {
          "id": "ao_descriptive_name",
          "description": "The counterfactual outcome",
          "stateDeltasByActor": {
            "actor_id": {
              "NARRATIVE": -30,
              "POLITICAL": 10,
              "ECONOMIC": 5,
              "MILITARY": -15
            }
          },
          "unlocksPivotPoints": ["pp_..."],
          "blockedByPivotPoints": ["pp_..."]
        }
      ]
    }
  ],

  "structuralAnalogies": [
    {
      "pattern": "Pattern name (e.g., Thucydides Trap)",
      "historicalCase": "The historical precedent",
      "relevance": "Why this pattern applies",
      "projectedConsequence": "What the pattern predicts"
    }
  ],

  "initialStateVectors": {
    "actor_id": {
      "NARRATIVE": 0,
      "POLITICAL": 0,
      "ECONOMIC": 0,
      "MILITARY": 0
    }
  },

  "gameTheoryNodes": [
    {
      "pivotPointId": "pp_...",
      "actorId": "actor_id",
      "options": [
        {
          "action": "Action description",
          "payoffsByScenario": {
            "best_case": 8,
            "worst_case": -3,
            "expected": 4
          },
          "conditions": "When this action makes sense"
        }
      ]
    }
  ]
}
```

### Key concepts

| Field | Purpose |
|-------|---------|
| `baselineTimeline` | The real historical timeline — what actually happened |
| `pivotPoints` | Critical decision junctures where alternate outcomes can be injected |
| `stateDeltasByActor` | How each alternate outcome shifts each actor's state vectors (range: -30 to +30 per dimension) |
| `initialStateVectors` | Starting scores for each actor across all four dimensions (range: -100 to +100) |
| `structuralAnalogies` | Historical patterns the simulation should reference when projecting consequences |
| `gameTheoryNodes` | Payoff matrices for game-theoretic analysis at pivot points |
| `unlocksPivotPoints` / `blockedByPivotPoints` | Dependency chains between pivot points |

### Creating a history file

There are four ways to create a history file:

1. **Write it manually** — Author the JSON by hand following the schema above. A sample file is included at `backend/data/sample_history_iran_trap.json`.

2. **Use the LLM-guided builder** — On the Setup page, click "Build with AI." Describe your scenario in natural language, and the LLM will ask follow-up questions before generating the full JSON structure.

3. **Generate from web search** — On the Setup page, click "Search & Build." Enter a topic (e.g., "US-China trade war 2018-2024"), and the system uses Tavily to search the web, then feeds the results to the LLM to extract a structured history file.

4. **Generate from a URL** — Provide a URL to an article or analysis, and the system extracts the content and generates a history file from it.

All generated files are validated against the schema before use. You can review and edit the JSON before launching a simulation.

### Sample history file

The project includes a sample scenario — **"The Iran Trap: US-Iran Conflict Escalation"** — covering the period from October 2023 to June 2026. It tracks six actors (United States, Israel, Iran, Saudi Arabia, China, Russia) across pivot points including the October 7 response, carrier deployment decisions, nuclear threshold crossing, and Strait of Hormuz confrontation. Load it from the Setup page via the "Load Sample" button.

---

## Usage Workflow

1. **Create a scenario** — Navigate to `/simulate` and upload, build, or search for a history file
2. **Review and configure** — Inspect the pivot points and state vectors; optionally run Nash equilibrium analysis
3. **Launch simulation** — Click "Launch Simulation" to start the MiroFish pipeline
4. **Monitor progress** — Watch real-time agent actions and state vector changes on the simulation workspace
5. **Inject counterfactuals** — Click alternate outcomes on the timeline to branch the simulation
6. **Analyze divergence** — Compare the counterfactual timeline against the baseline and generate reports

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, React Router 7, Zustand, Vite |
| Backend | FastAPI, Python 3.9+, aiosqlite |
| LLM | OpenRouter (DeepSeek Chat) |
| Search | Tavily API |
| Game Theory | nashpy, numpy, scipy |
| Simulation | [MiroFish](https://github.com/666ghj/MiroFish) |

---

## Project Structure

```
MiroJiang/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── database.py              # SQLite schema and connection
│   ├── routers/
│   │   ├── history.py           # History file CRUD and builder
│   │   ├── simulation.py        # Simulation lifecycle and SSE
│   │   ├── nash.py              # Nash equilibrium analysis
│   │   └── report.py            # Report generation
│   ├── services/
│   │   ├── history_fusion.py    # State vector operations
│   │   ├── llm_service.py       # LLM API client
│   │   ├── tavily_service.py    # Web search client
│   │   ├── nash_engine.py       # Game theory computations
│   │   ├── mirofish_proxy.py    # MiroFish API proxy
│   │   └── divergence_report.py # Report builder
│   ├── prompts/
│   │   ├── predictive_history.txt  # Simulation system prompt
│   │   └── history_extraction.txt  # History extraction prompt
│   └── data/
│       └── sample_history_iran_trap.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── SetupPage.jsx
│   │   │   ├── SimulationWorkspace.jsx
│   │   │   └── ReportPage.jsx
│   │   ├── components/PredictiveHistory/
│   │   │   ├── HistoryFileUpload.jsx
│   │   │   ├── HistoryFileBuilder.jsx
│   │   │   ├── CounterfactualInjector.jsx
│   │   │   ├── StateVectorMonitor.jsx
│   │   │   ├── BranchDivergenceMeter.jsx
│   │   │   └── DivergenceReportExport.jsx
│   │   ├── stores/simulationStore.js
│   │   └── lib/api.js
│   └── package.json
├── start.sh
├── .env
└── README.md
```

---

## License

This project is provided for academic and research purposes.
