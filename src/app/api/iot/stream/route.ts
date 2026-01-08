import { NextRequest } from "next/server";

// Blynk API Configuration
const BLYNK_TOKEN = "cb9wrnFvTzQFz8DDqGHdftortKgiVd4W";
const BLYNK_BASE_URL = "https://sgp1.blynk.cloud/external/api/get";

// API Endpoints
const API_TEMPERATURE = `${BLYNK_BASE_URL}?token=${BLYNK_TOKEN}&v4`;
const API_HUMIDITY = `${BLYNK_BASE_URL}?token=${BLYNK_TOKEN}&v5`;

// Polling interval in milliseconds (2 seconds for near real-time)
const POLL_INTERVAL = 2000;

interface SensorReading {
  temperature: number | null;
  humidity: number | null;
  timestamp: string;
  error?: string;
}

async function fetchSensorData(): Promise<SensorReading> {
  const timestamp = new Date().toISOString();

  try {
    const [tempResponse, humResponse] = await Promise.all([
      fetch(API_TEMPERATURE, { cache: "no-store" }),
      fetch(API_HUMIDITY, { cache: "no-store" }),
    ]);

    let temperature: number | null = null;
    let humidity: number | null = null;

    if (tempResponse.ok) {
      const tempData = await tempResponse.text();
      const tempValue = parseFloat(tempData);
      if (!isNaN(tempValue)) {
        temperature = tempValue;
      }
    }

    if (humResponse.ok) {
      const humData = await humResponse.text();
      const humValue = parseFloat(humData);
      if (!isNaN(humValue)) {
        humidity = humValue;
      }
    }

    return { temperature, humidity, timestamp };
  } catch (error) {
    return {
      temperature: null,
      humidity: null,
      timestamp,
      error: error instanceof Error ? error.message : "Failed to fetch sensor data",
    };
  }
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial data immediately
      const initialData = await fetchSensorData();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialData)}\n\n`));

      // Set up polling interval
      const intervalId = setInterval(async () => {
        try {
          const data = await fetchSensorData();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (error) {
          console.error("SSE Error:", error);
        }
      }, POLL_INTERVAL);

      // Clean up on client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(intervalId);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
