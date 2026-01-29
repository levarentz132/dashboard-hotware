"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for default marker icons in Leaflet with Next.js
const DefaultIcon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapSelectorProps {
    lat: number;
    lng: number;
    onChange: (lat: number, lng: number) => void;
}

function LocationMarker({ lat, lng, onChange }: MapSelectorProps) {
    const map = useMap();

    useMapEvents({
        click(e: L.LeafletMouseEvent) {
            onChange(e.latlng.lat, e.latlng.lng);
        },
    });

    useEffect(() => {
        map.flyTo([lat, lng], map.getZoom());
    }, [lat, lng, map]);

    return <Marker position={[lat, lng]} />;
}

export default function MapSelector({ lat, lng, onChange }: MapSelectorProps) {
    const [initialPos] = useState<[number, number]>([lat || -6.200000, lng || 106.816666]);

    return (
        <div className="h-full w-full rounded-lg overflow-hidden border border-gray-200">
            <MapContainer
                center={initialPos}
                zoom={13}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom={true}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationMarker lat={lat || initialPos[0]} lng={lng || initialPos[1]} onChange={onChange} />
            </MapContainer>
        </div>
    );
}
