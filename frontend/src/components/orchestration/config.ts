/**
 * Orchestration Module - Setup & Configuration Guide
 * 
 * This file provides comprehensive documentation and setup for the
 * ProcessMate Orchestration Module.
 */

/* eslint-disable @next/next/no-html-link-for-pages */

export const ORCHESTRATION_CONFIG = {
  // Module metadata
  name: 'ProcessMate Orchestration',
  version: '1.0.0',
  author: 'ProcessMate Admin Team',
  description: 'Comprehensive procedure orchestration and management system',

  // Feature flags
  features: {
    dashboard: true,
    procedures: true,
    processFlow: true,
    raciMatrix: true,
    validationHub: true,
    emailIntegration: true,
    realTimeUpdates: false, // Requires WebSocket implementation
    exportPDF: false, // Requires pdf library
    exportExcel: false, // Requires xlsx integration
  },

  // Routes
  routes: {
    base: '/orchestration',
    dashboard: '/orchestration#dashboard',
    procedures: '/orchestration#procedures',
    flow: '/orchestration#flow',
    raci: '/orchestration#raci',
    validation: '/orchestration#validation',
    email: '/orchestration#email',
  },

  // Sample data configuration
  sampleData: {
    procedureCount: 4,
    versionCount: 2.5, // average versions per procedure
    teamSize: 5,
    categoryCount: 4,
    monthsOfData: 6,
  },

  // UI Configuration
  ui: {
    sidebar: {
      width: 256, // pixels when expanded
      collapsedWidth: 80, // pixels when collapsed
      animationDuration: 300, // milliseconds
    },
    colors: {
      primary: 'indigo',
      secondary: 'purple',
      success: 'green',
      warning: 'orange',
      danger: 'red',
      info: 'blue',
    },
    layout: {
      headerHeight: 100,
      sidebarPosition: 'left',
      contentPadding: 32,
    },
  },

  // Performance settings
  performance: {
    itemsPerPage: 10,
    debounceSearchMs: 300,
    chartAnimationMs: 500,
  },

  // Validation rules
  validation: {
    minProcedureNameLength: 3,
    maxProcedureNameLength: 100,
    maxCommentLength: 5000,
    maxAttachmentSizeMB: 10,
  },

  // Email configuration (stub for backend integration)
  email: {
    senderEmail: 'orchestration@processmate.local',
    supportEmail: 'support@processmate.local',
    templates: [
      'validation_request',
      'approval_notification',
      'rejection_notification',
      'escalation_alert',
      'status_update',
    ],
  },
};

// Helper function to get feature status
export function isFeatureEnabled(featureName: keyof typeof ORCHESTRATION_CONFIG.features): boolean {
  return ORCHESTRATION_CONFIG.features[featureName];
}

// Helper function to get route
export function getOrchestrationRoute(routeName: keyof typeof ORCHESTRATION_CONFIG.routes): string {
  return ORCHESTRATION_CONFIG.routes[routeName];
}

export default ORCHESTRATION_CONFIG;
