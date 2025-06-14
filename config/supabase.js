/**
 * Supabase Configuration for Dr. Alex AI Provider Platform
 * Handles authentication, database operations, and real-time subscriptions
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../services/logger');

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate configuration
if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  logger.warn('Supabase configuration incomplete - some features may not work');
}

// Create Supabase clients
let supabase = null;
let supabaseAdmin = null;

if (supabaseUrl && supabaseAnonKey) {
  // Public client for authentication
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    },
    db: {
      schema: 'public'
    }
  });

  logger.info('Supabase public client initialized');
}

if (supabaseUrl && supabaseServiceKey) {
  // Admin client for server-side operations
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    }
  });

  logger.info('Supabase admin client initialized');
}

/**
 * Provider Authentication Functions
 */
class SupabaseAuth {
  
  /**
   * Register a new provider
   */
  async registerProvider(email, password, providerData) {
    try {
      if (!supabaseAdmin) {
        throw new Error('Supabase admin client not available');
      }

      // Create auth user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role: 'provider',
          firstName: providerData.firstName,
          lastName: providerData.lastName
        }
      });

      if (authError) {
        logger.error('Supabase auth registration error:', authError);
        throw new Error(authError.message);
      }

      // Create provider record
      const { data: providerRecord, error: providerError } = await supabaseAdmin
        .from('providers')
        .insert({
          id: authData.user.id,
          email: authData.user.email,
          first_name: providerData.firstName,
          last_name: providerData.lastName,
          license_number: providerData.licenseNumber,
          specialty: providerData.specialty,
          organization: providerData.organization,
          phone: providerData.phone,
          subscription_tier: 'essential',
          subscription_status: 'active',
          is_active: true,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (providerError) {
        logger.error('Provider record creation error:', providerError);
        // Clean up auth user if provider record creation fails
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        throw new Error('Failed to create provider record');
      }

      logger.info(`Provider registered successfully: ${email}`);
      return {
        user: authData.user,
        provider: providerRecord
      };

    } catch (error) {
      logger.error('Provider registration error:', error);
      throw error;
    }
  }

  /**
   * Authenticate provider login
   */
  async loginProvider(email, password) {
    try {
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      // Authenticate with Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        logger.error('Supabase auth login error:', authError);
        throw new Error('Invalid credentials');
      }

      // Get provider details
      const { data: providerData, error: providerError } = await supabase
        .from('providers')
        .select(`
          *,
          provider_practice_memberships!inner(
            role,
            permissions,
            is_active,
            provider_practices!inner(
              id,
              practice_name,
              practice_type,
              address_line1,
              city,
              state,
              zip_code
            )
          )
        `)
        .eq('id', authData.user.id)
        .eq('is_active', true)
        .single();

      if (providerError || !providerData) {
        logger.error('Provider data retrieval error:', providerError);
        throw new Error('Provider account not found or inactive');
      }

      // Update last login
      await supabase
        .from('providers')
        .update({ last_login: new Date().toISOString() })
        .eq('id', authData.user.id);

      logger.info(`Provider logged in successfully: ${email}`);
      
      return {
        session: authData.session,
        user: authData.user,
        provider: providerData
      };

    } catch (error) {
      logger.error('Provider login error:', error);
      throw error;
    }
  }

  /**
   * Verify provider session
   */
  async verifySession(accessToken) {
    try {
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      // Verify the session
      const { data: { user }, error } = await supabase.auth.getUser(accessToken);

      if (error || !user) {
        throw new Error('Invalid or expired session');
      }

      // Get provider details
      const { data: providerData, error: providerError } = await supabase
        .from('providers')
        .select('*')
        .eq('id', user.id)
        .eq('is_active', true)
        .single();

      if (providerError || !providerData) {
        throw new Error('Provider not found or inactive');
      }

      return {
        user,
        provider: providerData
      };

    } catch (error) {
      logger.error('Session verification error:', error);
      throw error;
    }
  }

  /**
   * Logout provider
   */
  async logoutProvider() {
    try {
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      const { error } = await supabase.auth.signOut();
      
      if (error) {
        logger.error('Logout error:', error);
        throw new Error('Logout failed');
      }

      logger.info('Provider logged out successfully');
      return true;

    } catch (error) {
      logger.error('Provider logout error:', error);
      throw error;
    }
  }

  /**
   * Reset password
   */
  async resetPassword(email) {
    try {
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3004'}/reset-password`
      });

      if (error) {
        logger.error('Password reset error:', error);
        throw new Error('Password reset failed');
      }

      logger.info(`Password reset email sent to: ${email}`);
      return true;

    } catch (error) {
      logger.error('Password reset error:', error);
      throw error;
    }
  }
}

// Health check function
const healthCheck = async () => {
  try {
    if (!supabase) {
      return { status: 'unavailable', message: 'Supabase client not configured' };
    }

    // Simple query to test connection
    const { data, error } = await supabase
      .from('providers')
      .select('count')
      .limit(1);

    if (error) {
      return { status: 'error', message: error.message };
    }

    return { status: 'healthy', message: 'Supabase connection successful' };

  } catch (error) {
    return { status: 'error', message: error.message };
  }
};

module.exports = {
  supabase,
  supabaseAdmin,
  SupabaseAuth: new SupabaseAuth(),
  healthCheck
};
