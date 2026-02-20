import { NextRequest, NextResponse } from "next/server";
import { getAutomationStore, addRoom, addDevice } from "@/lib/json-storage";

export async function GET() {
    try {
        const store = await getAutomationStore();

        const enrichedDevices = await Promise.all(store.devices.map(async (device) => {
            if (device.api_url && store.api_token) {
                try {
                    const response = await fetch(device.api_url, {
                        headers: {
                            'Authorization': `Bearer ${store.api_token}`,
                            'Content-Type': 'application/json'
                        },
                        signal: AbortSignal.timeout(5000)
                    });

                    if (response.ok) {
                        const haData = await response.json();
                        let newState = haData.state;
                        const haUnit = haData.attributes?.unit_of_measurement;
                        const isAvailable = newState !== 'unavailable' && newState !== 'unknown';

                        if (isAvailable && device.type === 'temperature') {
                            let tempValue = parseFloat(newState);

                            // Check if conversion is needed: HA is C, User wants F
                            if (haUnit === '°C' && device.unit === '°F') {
                                tempValue = (tempValue * 9 / 5) + 32;
                                newState = tempValue.toFixed(1);
                            }
                            // Check if conversion is needed: HA is F, User wants C
                            else if (haUnit === '°F' && device.unit === '°C') {
                                tempValue = (tempValue - 32) * 5 / 9;
                                newState = tempValue.toFixed(1);
                            }
                        }

                        return {
                            ...device,
                            value: newState,
                            status: isAvailable ? 'online' : 'offline',
                            temperature: device.type === 'temperature' && isAvailable ? parseFloat(newState) : device.temperature,
                            humidity: device.type === 'humidity' && isAvailable ? parseFloat(newState) : device.humidity,
                        };
                    } else {
                        return { ...device, status: 'offline' };
                    }
                } catch (err) {
                    console.error(`Failed to fetch live data for ${device.name}:`, err);
                    return { ...device, status: 'offline' }; // Mark as offline on error
                }
            }
            return device;
        }));

        return NextResponse.json({
            success: true,
            data: {
                rooms: store.rooms,
                devices: enrichedDevices
            }
        });
    } catch (error) {
        return NextResponse.json({ success: false, error: "Failed to fetch automation data" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, payload } = body;

        if (action === "add_room") {
            const success = await addRoom(payload.name);
            return NextResponse.json({ success });
        }

        if (action === "add_device") {
            const device = await addDevice(payload);
            return NextResponse.json({ success: true, device });
        }

        return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ success: false, error: "Failed to process request" }, { status: 500 });
    }
}
