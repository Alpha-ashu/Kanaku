import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify token and get user
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const userEmail = user.email?.toLowerCase();
    const userId = user.id;

    console.log(' Permission check for user:', { userEmail, userId });

    // Define admin emails (can be moved to database later)
    const ADMIN_EMAILS = [
      'superadmin@KANAKU.com'
    ];

    // Define advisor emails (can be moved to database later)
    const ADVISOR_EMAILS = [
      'advisore@KANAKU.com'
    ];

    // Determine user role
    let userRole: 'admin' | 'advisor' | 'user';
    let allowedFeatures: string[] = [];
    let permissions: any = {};

    if (ADMIN_EMAILS.includes(userEmail)) {
      // Admin role - full access
      userRole = 'admin';
      allowedFeatures = [
        'accounts', 'transactions', 'loans', 'goals', 'groups',
        'investments', 'reports', 'calendar', 'todoLists',
        'transfer', 'taxCalculator', 'bookAdvisor',
        'adminPanel', 'featureControl', 'advisorPanel'
      ];
      permissions = {
        canAccessAdminPanel: true,
        canAccessAdvisorPanel: true,
        canControlFeatures: true,
        canViewAllUsers: true,
        canManageAdvisors: true,
        canApproveFeatures: true,
        canTestNewFeatures: true,
        canBookAdvisors: true,
        canPayForSessions: true,
        canJoinSessions: true,
        canViewSessionHistory: true,
        canRateAdvisors: true,
        canSetAvailability: false,
        canStartSessions: false,
        canReceiveBookings: false,
        canManageSessions: false,
        canReceivePayments: false,
        canViewClients: false,
      };
    } else if (ADVISOR_EMAILS.includes(userEmail)) {
      // Advisor role - limited admin access, full advisor access
      userRole = 'advisor';
      allowedFeatures = [
        'accounts', 'transactions', 'loans', 'goals', 'groups',
        'investments', 'reports', 'calendar', 'todoLists',
        'transfer', 'taxCalculator', 'bookAdvisor',
        'advisorPanel'
      ];
      permissions = {
        canAccessAdminPanel: false,
        canAccessAdvisorPanel: true,
        canControlFeatures: false,
        canViewAllUsers: false,
        canManageAdvisors: false,
        canApproveFeatures: false,
        canTestNewFeatures: false,
        canBookAdvisors: false,
        canPayForSessions: false,
        canJoinSessions: true,
        canViewSessionHistory: true,
        canRateAdvisors: true,
        canSetAvailability: true,
        canStartSessions: true,
        canReceiveBookings: true,
        canManageSessions: true,
        canReceivePayments: true,
        canViewClients: true,
      };
    } else {
      // Regular user - standard access
      userRole = 'user';
      allowedFeatures = [
        'accounts', 'transactions', 'loans', 'goals', 'groups',
        'investments', 'reports', 'calendar', 'todoLists',
        'transfer', 'taxCalculator', 'bookAdvisor'
      ];
      permissions = {
        canAccessAdminPanel: false,
        canAccessAdvisorPanel: false,
        canControlFeatures: false,
        canViewAllUsers: false,
        canManageAdvisors: false,
        canApproveFeatures: false,
        canTestNewFeatures: false,
        canBookAdvisors: true,
        canPayForSessions: true,
        canJoinSessions: true,
        canViewSessionHistory: true,
        canRateAdvisors: true,
        canSetAvailability: false,
        canStartSessions: false,
        canReceiveBookings: false,
        canManageSessions: false,
        canReceivePayments: false,
        canViewClients: false,
      };
    }

    // Get request body for additional permission checks
    let requestBody = {};
    try {
      if (req.body) {
        requestBody = await req.json();
      }
    } catch (e) {
      console.log('No request body');
    }

    // Handle specific permission requests from admin
    if (requestBody.checkPermission) {
      const { feature, targetRole } = requestBody.checkPermission;

      // Check if target role has access to feature
      const targetPermissions = targetRole === 'admin' ?
        ROLE_PERMISSIONS.admin :
        targetRole === 'advisor' ?
          ROLE_PERMISSIONS.advisor :
          ROLE_PERMISSIONS.user;

      const hasAccess = targetPermissions.features.includes(feature);

      return new Response(
        JSON.stringify({
          hasAccess,
          feature,
          targetRole,
          userRole: userEmail
        }),
        { headers: corsHeaders }
      );
    }

    // Handle feature control updates from admin
    if (requestBody.updatePermissions) {
      const { role: targetRole, features: newFeatures } = requestBody.updatePermissions;

      console.log(' Admin updating permissions for role:', targetRole, newFeatures);

      // In a real implementation, this would update a database
      // For now, just return success response
      return new Response(
        JSON.stringify({
          success: true,
          message: `Permissions updated for ${targetRole}`,
          features: newFeatures
        }),
        { headers: corsHeaders }
      );
    }

    const userPermissions = {
      role: userRole,
      allowedFeatures,
      permissions,
      lastUpdated: new Date().toISOString(),
      userId
    };

    console.log(' Permissions determined:', userPermissions);

    return new Response(
      JSON.stringify(userPermissions),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    console.error(' Permission check error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }),
      {
        status: 500,
        headers: corsHeaders
      }
    );
  }
});

// Role permissions definition (same as frontend)
const ROLE_PERMISSIONS = {
  admin: {
    features: [
      'accounts', 'transactions', 'loans', 'goals', 'groups',
      'investments', 'reports', 'calendar', 'todoLists',
      'transfer', 'taxCalculator', 'bookAdvisor',
      'adminPanel', 'featureControl', 'advisorPanel'
    ],
    canAccessAdminPanel: true,
    canAccessAdvisorPanel: true,
    canControlFeatures: true,
    canViewAllUsers: true,
    canManageAdvisors: true,
    canApproveFeatures: true,
    canTestNewFeatures: true,
  },
  advisor: {
    features: [
      'accounts', 'transactions', 'loans', 'goals', 'groups',
      'investments', 'reports', 'calendar', 'todoLists',
      'transfer', 'taxCalculator', 'bookAdvisor',
      'advisorPanel'
    ],
    canAccessAdvisorPanel: true,
    canSetAvailability: true,
    canStartSessions: true,
    canReceiveBookings: true,
    canManageSessions: true,
    canReceivePayments: true,
    canViewClients: true,
  },
  user: {
    features: [
      'accounts', 'transactions', 'loans', 'goals', 'groups',
      'investments', 'reports', 'calendar', 'todoLists',
      'transfer', 'taxCalculator', 'bookAdvisor'
    ],
    canBookAdvisors: true,
    canPayForSessions: true,
    canJoinSessions: true,
    canViewSessionHistory: true,
    canRateAdvisors: true,
  }
};
