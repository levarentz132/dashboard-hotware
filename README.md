# Hotware Dashboard

A comprehensive React-based camera surveillance dashboard management system with advanced features including camera inventory reports, health monitoring, alarm console, flexible dashboards, business intelligence analytics, and IoT integration.

## 🚀 Features

### 🔒 Security & System Health
- **Camera Inventory Report** – Complete list of cameras with type, location, and details
- **Camera Health Check Report** – Monitor online/offline status and errors
- **Disabled Devices Report** – Identify inactive or disconnected devices
- **Customizable Alarm Console** – Monitor and manage alarms/events in real-time

### 📊 Operations & Monitoring
- **Flexible Dashboard** – User-customizable dashboards with widgets
- **User-Generated Dashboards** – Create, import, and export templates
- **Alarms & Events Report** – Detailed records of triggered alarms and system events
- **Audit Reports** – Track system usage and user actions
- **Storage Consumption Report** – Monitor video storage usage and forecast needs

### 💡 Business Intelligence & Analytics
- **Visualization Widgets** – Charts, graphs, heatmaps, maps, and trend lines
- **IoT & Metadata Integration** – Connect IoT sensors and analytics data for deeper insights
- **Multi-Server Support** – Combine insights from multiple Nx Witness servers into one view

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript + Next.js 15
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Charts**: Recharts (for future implementation)
- **State Management**: Zustand
- **Real-time**: Socket.io Client
- **Animations**: Framer Motion
- **Development**: ESLint + TypeScript

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn package manager
- Modern web browser with ES2020 support

## ⚡ Quick Start

1. **Clone or navigate to the project directory**
   ```bash
   cd "dashboard hotware"
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🏗️ Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout component
│   ├── page.tsx           # Main dashboard page
│   └── globals.css        # Global styles
├── components/
│   ├── alarms/            # Alarm console components
│   │   └── AlarmConsole.tsx
│   ├── analytics/         # Business intelligence components  
│   │   └── Analytics.tsx
│   ├── cameras/           # Camera management components
│   │   └── CameraInventory.tsx
│   ├── dashboard/         # Dashboard overview components
│   │   └── DashboardOverview.tsx
│   ├── layout/            # Layout components
│   │   ├── Sidebar.tsx
│   │   └── TopBar.tsx
│   ├── monitoring/        # System health components
│   │   └── SystemHealth.tsx
│   ├── ui/                # Reusable UI components
│   │   └── StatsCard.tsx
│   └── widgets/           # Dashboard widgets
│       ├── CameraStatusGrid.tsx
│       ├── RecentAlarmsWidget.tsx
│       ├── StorageWidget.tsx
│       └── SystemStatusWidget.tsx
```

## 🎯 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## 🔌 Integration Points

### Camera System API Integration
The dashboard is designed to integrate with various camera system REST API endpoints:
- Camera management endpoints
- Event and alarm APIs
- System health monitoring
- User authentication
- Storage management APIs

### IoT Sensor Integration
Placeholder components for connecting:
- Temperature sensors
- Humidity monitors
- Occupancy counters
- Air quality sensors
- Custom metadata sources

## 🎨 Customization

### Adding New Dashboard Widgets
1. Create widget component in `src/components/widgets/`
2. Import and add to `DashboardOverview.tsx`
3. Configure widget layout in the dashboard grid

### Theme Customization
Modify `tailwind.config.js` to customize:
- Color schemes
- Typography
- Spacing
- Component styling

## 🚀 Deployment

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Environment Variables
Create `.env.local` for configuration:
```env
NEXT_PUBLIC_API_URL=your_camera_system_api_url
NEXT_PUBLIC_WS_URL=your_websocket_url
NEXT_PUBLIC_BRAND_NAME=Hotware
```

## 📱 Responsive Design

The dashboard is fully responsive and optimized for:
- Desktop (1920x1080+)
- Laptop (1366x768+)
- Tablet (768x1024)
- Mobile (375x667+)

## 🔐 Security Considerations

- Implement authentication middleware
- Secure API endpoints
- HTTPS in production
- Input validation and sanitization
- Role-based access control

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the component examples

## 🗺️ Roadmap

- [ ] Camera system API integration
- [ ] Real-time WebSocket connectivity
- [ ] Advanced charting and visualization
- [ ] User authentication system
- [ ] Multi-server management
- [ ] Mobile app companion
- [ ] Advanced IoT integrations
- [ ] Custom widget builder
- [ ] Report scheduling system
- [ ] Advanced analytics engine