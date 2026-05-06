const express = require("express");
require("dotenv").config();

async function Log(source, level, component, message) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${level.toUpperCase()} ${source}:${component} - ${message}`);
}

module.exports = { Log };

const app = express();
const PORT = process.env.PORT || 3001;
const BASE_URL = "http://20.207.122.201/evaluation-service";
const TOKEN = process.env.ACCESS_TOKEN;

const headers = {
  "Authorization": `Bearer ${TOKEN}`,
  "Content-Type": "application/json"
};

// Knapsack DP — O(n * W) time, O(W) space
function knapsack(tasks, capacity) {
  const n = tasks.length;
  // dp[w] = max impact achievable with exactly w hours
  const dp = new Array(capacity + 1).fill(0);
  const chosen = new Array(capacity + 1).fill(null).map(() => []);

  for (let i = 0; i < n; i++) {
    const { Duration, Impact, TaskID } = tasks[i];
    // traverse backwards to avoid using same item twice
    for (let w = capacity; w >= Duration; w--) {
      const withItem = dp[w - Duration] + Impact;
      if (withItem > dp[w]) {
        dp[w] = withItem;
        chosen[w] = [...chosen[w - Duration], TaskID];
      }
    }
  }

  return { maxImpact: dp[capacity], selectedTasks: chosen[capacity] };
}

app.get("/schedule/:depotId", async (req, res) => {
  const { depotId } = req.params;

  await Log("backend", "info", "handler", `Received schedule request for depot ${depotId}`);

  try {
    // Fetch all depots
    await Log("backend", "debug", "service", "Fetching depots from external API");
    const depotRes = await fetch(`${BASE_URL}/depots`, { headers });
    const depotData = await depotRes.json();

    const depot = depotData.depots.find(d => d.ID == depotId);
    if (!depot) {
      await Log("backend", "warn", "handler", `Depot ${depotId} not found`);
      return res.status(404).json({ error: "Depot not found" });
    }

    const capacity = depot.MechanicHours;
    await Log("backend", "info", "service", `Depot ${depotId} has ${capacity} mechanic-hours`);

    // Fetch all vehicles/tasks
    await Log("backend", "debug", "service", "Fetching vehicles from external API");
    const vehicleRes = await fetch(`${BASE_URL}/vehicles`, { headers });
    const vehicleData = await vehicleRes.json();
    const tasks = vehicleData.vehicles;

    await Log("backend", "info", "service", `Fetched ${tasks.length} tasks, running knapsack optimization`);

    // Run knapsack
    const { maxImpact, selectedTasks } = knapsack(tasks, capacity);

    await Log("backend", "info", "service", `Optimization complete: ${selectedTasks.length} tasks selected, total impact ${maxImpact}`);

    const result = {
      depotId: depot.ID,
      mechanicHoursBudget: capacity,
      totalImpactScore: maxImpact,
      selectedTasks
    };

    await Log("backend", "info", "handler", `Returning schedule for depot ${depotId}`);
    res.json(result);

  } catch (err) {
    await Log("backend", "error", "handler", `Error scheduling depot ${depotId}: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/schedule", async (req, res) => {
  await Log("backend", "info", "handler", "Received request to schedule all depots");

  try {
    const depotRes = await fetch(`${BASE_URL}/depots`, { headers });
    const depotData = await depotRes.json();
    const vehicleRes = await fetch(`${BASE_URL}/vehicles`, { headers });
    const vehicleData = await vehicleRes.json();
    const tasks = vehicleData.vehicles;

    await Log("backend", "info", "service", `Scheduling all ${depotData.depots.length} depots`);

    const results = depotData.depots.map(depot => {
      const { maxImpact, selectedTasks } = knapsack(tasks, depot.MechanicHours);
      return {
        depotId: depot.ID,
        mechanicHoursBudget: depot.MechanicHours,
        totalImpactScore: maxImpact,
        selectedTaskCount: selectedTasks.length,
        selectedTasks
      };
    });

    await Log("backend", "info", "handler", "All depot schedules computed successfully");
    res.json({ depots: results });

  } catch (err) {
    await Log("backend", "fatal", "handler", `Fatal error in schedule-all: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

if (require.main === module) {
  app.listen(PORT, async () => {
    await Log("backend", "info", "config", `Vehicle scheduler running on port ${PORT}`);
    console.log(`Vehicle scheduler on http://localhost:${PORT}`);
  });
}