# Hotware Dashboard - Copilot Instructions

## Project Overview

This is a React-based dashboard management system for Hotware camera surveillance with comprehensive security monitoring, analytics, and IoT integration capabilities.

## Project Checklist Status

- [x] Copilot instructions file created
- [x] Project requirements clarified - React dashboard for Hotware
- [x] Project scaffolded - Next.js with TypeScript and Tailwind CSS
- [x] Custom features implemented - Dashboard, cameras, health, alarms, analytics
- [x] Dependencies compiled successfully
- [x] Development tasks created and running
- [x] Documentation completed
- [x] Code refactored with Clean Code principles (SoC, DRY)

## Key Components

- Dashboard Overview with real-time widgets
- Camera Inventory management system
- System Health monitoring
- Alarm Console for real-time alerts
- Analytics and Business Intelligence
- IoT sensor integration placeholders

## Architecture & Code Organization

### Types (`src/types/`)

- `index.ts` - Central export for all types
- `Device.d.ts` - Camera and device interfaces
- `Server.d.ts` - Server interfaces
- `Media.d.ts` - Media/stream interfaces
- `Cloud.d.ts` - Cloud API types (CloudSystem, CloudDevice, etc.)
- `Common.d.ts` - Shared types (ApiResponse, LoadingState, StatusType)

### Constants (`src/constants/`)

- `index.ts` - Central export for constants
- `app-constants.ts` - Application-wide constants (timeouts, intervals, messages)
- `camera-constant.ts` - Camera-specific constants

### Hooks (`src/hooks/`)

- `index.ts` - Central export for hooks
- `use-async-data.ts` - Generic async data fetching hook factory
- `useNxAPI.ts` - Events and alarms hooks
- `useNxAPI-camera.ts` - Camera-related hooks
- `useNxAPI-server.ts` - Server-related hooks
- `useNxAPI-system.ts` - System info hooks

### Library/Services (`src/lib/`)

- `index.ts` - Central export for services
- `cloud-api.ts` - Cloud API utilities (fetch, auth, error handling)
- `status-utils.ts` - Status colors, badges, formatters
- `nxapi.ts` - NX Witness API client class
- `config.ts` - API configuration
- `db.ts` - Database connection pool
- `utils.ts` - General utilities (cn)

### Components (`src/components/`)

- `common/` - Shared components (StateComponents, StatusComponents, forms)
- `ui/` - shadcn/UI components
- `widgets/` - Dashboard widgets
  - `types.ts` - Shared widget interfaces
  - `widget-service.ts` - Cloud systems, events, storage, audit API
  - `index.ts` - Barrel export all widgets
- `dashboard/` - Dashboard layouts
  - `types.ts` - Layout, widget interfaces
  - `dashboard-service.ts` - Layout persistence, import/export
  - `index.ts` - Barrel export
- `cameras/` - Camera management
  - `types.ts` - Camera-related interfaces
  - `camera-service.ts` - Cloud systems, cameras, locations API
  - `camera-utils.ts` - Status, location formatting utilities
  - `index.ts` - Barrel export
- `monitoring/` - System health
  - `monitoring-service.ts` - System details, server locations API
  - `index.ts` - Barrel export
- `alarms/` - Alarm console
  - `types.ts` - Event/alarm interfaces
  - `alarm-service.ts` - Events, formatting, filtering utilities
  - `index.ts` - Barrel export
- `audits/` - Audit log
  - `types.ts` - Audit log interfaces
  - `audit-service.ts` - Audit API, formatting, filtering
  - `index.ts` - Barrel export
- `users/` - User management
  - `types.ts` - User, group interfaces
  - `user-service.ts` - User CRUD API, utilities
  - `index.ts` - Barrel export
- `servers/` - Server management
  - `types.ts` - Server interfaces
  - `server-service.ts` - Server API, utilities
  - `index.ts` - Barrel export
- `analytics/` - IoT analytics
  - `types.ts` - Sensor data interfaces
  - `analytics-service.ts` - Sensor utilities, formatting
  - `index.ts` - Barrel export
- `storage/` - Storage management
  - `types.ts` - Storage-related interfaces
  - `storage-service.ts` - Cloud/local storage CRUD API
  - `storage-utils.ts` - Formatting, calculation utilities
  - `index.ts` - Barrel export

## Development Guidelines

- Use TypeScript for type safety
- Follow React best practices with hooks
- Implement responsive design with Tailwind CSS
- Maintain component modularity
- Add proper error handling and loading states
- Import from index files when possible (`@/hooks`, `@/types`, `@/constants`)
- Use shared components from `@/components/common`
- Use status utilities from `@/lib/status-utils`

## Import Patterns

```typescript
// Prefer barrel imports from central modules
import { useCameras, useServers } from "@/hooks";
import { StatusBadge, LoadingState } from "@/components/common";
import { API_TIMEOUTS, REFRESH_INTERVALS } from "@/constants";
import { getStatusColor, formatBytes } from "@/lib";

// Import from component-level barrel exports
import { fetchCloudSystems, formatCameraLocation } from "@/components/cameras";
import { fetchCloudEvents, formatTimestamp } from "@/components/alarms";
import { fetchLocalStorages, getUsagePercentage } from "@/components/storage";
import { fetchSystemDetails, fetchServerLocations } from "@/components/monitoring";
import { fetchAuditLogs, getEventInfo } from "@/components/audits";
import { fetchUsers, getUserTypeBadge } from "@/components/users";
import { fetchCloudServers, isServerOnline } from "@/components/servers";
import { getTemperatureStatus, formatTime } from "@/components/analytics";
import { loadDashboardLayout, saveDashboardLayout } from "@/components/dashboard";
import { AlarmConsoleWidget, StorageSummaryWidget } from "@/components/widgets";
```

<!--
## Execution Guidelines
PROGRESS TRACKING:
- If any tools are available to manage the above todo list, use it to track progress through this checklist.
- After completing each step, mark it complete and add a summary.
- Read current todo list status before starting each new step.

COMMUNICATION RULES:
- Avoid verbose explanations or printing full command outputs.
- If a step is skipped, state that briefly (e.g. "No extensions needed").
- Do not explain project structure unless asked.
- Keep explanations concise and focused.

DEVELOPMENT RULES:
- Use '.' as the working directory unless user specifies otherwise.
- Avoid adding media or external links unless explicitly requested.
- Use placeholders only with a note that they should be replaced.
- Use VS Code API tool only for VS Code extension projects.
- Once the project is created, it is already opened in Visual Studio Code—do not suggest commands to open this project in Visual Studio again.
- If the project setup information has additional rules, follow them strictly.

FOLDER CREATION RULES:
- Always use the current directory as the project root.
- If you are running any terminal commands, use the '.' argument to ensure that the current working directory is used ALWAYS.
- Do not create a new folder unless the user explicitly requests it besides a .vscode folder for a tasks.json file.
- If any of the scaffolding commands mention that the folder name is not correct, let the user know to create a new folder with the correct name and then reopen it again in vscode.

EXTENSION INSTALLATION RULES:
- Only install extension specified by the get_project_setup_info tool. DO NOT INSTALL any other extensions.

PROJECT CONTENT RULES:
- If the user has not specified project details, assume they want a "Hello World" project as a starting point.
- Avoid adding links of any type (URLs, files, folders, etc.) or integrations that are not explicitly required.
- Avoid generating images, videos, or any other media files unless explicitly requested.
- If you need to use any media assets as placeholders, let the user know that these are placeholders and should be replaced with the actual assets later.
- Ensure all generated components serve a clear purpose within the user's requested workflow.
- If a feature is assumed but not confirmed, prompt the user for clarification before including it.
- If you are working on a VS Code extension, use the VS Code API tool with a query to find relevant VS Code API references and samples related to that query.

TASK COMPLETION RULES:
- Your task is complete when:
  - Project is successfully scaffolded and compiled without errors
  - copilot-instructions.md file in the .github directory exists in the project
  - README.md file exists and is up to date
  - User is provided with clear instructions to debug/launch the project

Before starting a new task in the above plan, update progress in the plan.
-->

- Work through each checklist item systematically.
- Keep communication concise and focused.
- Follow development best practices.
