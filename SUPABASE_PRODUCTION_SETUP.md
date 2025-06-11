# 🚀 **SUPABASE PRODUCTION SETUP GUIDE**

## 📋 **OVERVIEW**

This guide will help you set up Supabase for production use with the Dr. Alex AI Provider Platform. All demo instances have been removed and the platform is now production-ready.

## 🎯 **STEP 1: CREATE SUPABASE PROJECT**

1. **Go to [supabase.com](https://supabase.com)**
2. **Sign in** or create an account
3. **Click "New Project"**
4. **Configure your project:**
   - **Name:** `dralexai-provider-platform`
   - **Database Password:** Use a strong password (save this!)
   - **Region:** Choose closest to your users
   - **Pricing Plan:** Pro (recommended for production)

## 🗄️ **STEP 2: DATABASE SCHEMA SETUP**

### **Run the Provider Schema**
In your Supabase SQL Editor, execute:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create providers table
CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    license_number VARCHAR(50) UNIQUE NOT NULL,
    specialty VARCHAR(100),
    organization VARCHAR(200),
    phone VARCHAR(20),
    subscription_tier VARCHAR(50) DEFAULT 'essential',
    subscription_status VARCHAR(50) DEFAULT 'active',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create provider practices table
CREATE TABLE provider_practices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    practice_name VARCHAR(200) NOT NULL,
    practice_type VARCHAR(100),
    address_line1 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(2),
    zip_code VARCHAR(10),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create provider practice memberships table
CREATE TABLE provider_practice_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    practice_id UUID NOT NULL REFERENCES provider_practices(id) ON DELETE CASCADE,
    role VARCHAR(100) DEFAULT 'provider',
    permissions JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(provider_id, practice_id)
);

-- Create indexes for performance
CREATE INDEX idx_providers_email ON providers(email);
CREATE INDEX idx_providers_license ON providers(license_number);
CREATE INDEX idx_providers_active ON providers(is_active);
CREATE INDEX idx_practice_memberships_provider ON provider_practice_memberships(provider_id);
CREATE INDEX idx_practice_memberships_practice ON provider_practice_memberships(practice_id);
```

## 🔐 **STEP 3: AUTHENTICATION SETUP**

### **Enable Email Authentication**
1. Go to **Authentication > Settings**
2. **Enable Email authentication**
3. **Disable** sign-ups (we'll handle registration through our API)
4. **Set up email templates** (optional)

### **Configure Row Level Security (RLS)**
```sql
-- Enable RLS on providers table
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;

-- Policy: Providers can only see their own data
CREATE POLICY "Providers can view own data" ON providers
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Providers can update own data" ON providers
    FOR UPDATE USING (auth.uid() = id);

-- Enable RLS on practice tables
ALTER TABLE provider_practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_practice_memberships ENABLE ROW LEVEL SECURITY;

-- Policy: Providers can see practices they belong to
CREATE POLICY "Providers can view their practices" ON provider_practices
    FOR SELECT USING (
        id IN (
            SELECT practice_id FROM provider_practice_memberships 
            WHERE provider_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "Providers can view their memberships" ON provider_practice_memberships
    FOR SELECT USING (provider_id = auth.uid());
```

## 🔑 **STEP 4: GET API KEYS**

1. **Go to Settings > API**
2. **Copy these values:**
   - **Project URL:** `https://your-project-ref.supabase.co`
   - **Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - **Service Role Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

## ⚙️ **STEP 5: UPDATE ENVIRONMENT VARIABLES**

Update your `.env` file:

```env
# Supabase Configuration (Production)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-actual-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-actual-service-role-key

# JWT Secret (use the same as Supabase JWT secret)
JWT_SECRET=your-supabase-jwt-secret

# Database Fallback (optional)
DATABASE_URL=postgresql://postgres:password@localhost:5432/dralexai_provider
```

## 🧪 **STEP 6: TEST AUTHENTICATION**

### **Create Test Provider**
Use the registration endpoint to create a test provider:

```bash
curl -X POST http://localhost:3004/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@yourdomain.com",
    "password": "SecurePassword123!",
    "firstName": "Test",
    "lastName": "Provider",
    "licenseNumber": "MD123456789",
    "specialty": "Internal Medicine",
    "organization": "Test Healthcare"
  }'
```

### **Test Login**
```bash
curl -X POST http://localhost:3004/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@yourdomain.com",
    "password": "SecurePassword123!",
    "license": "MD123456789"
  }'
```

## 🔒 **STEP 7: SECURITY CONFIGURATION**

### **Set up CORS**
In Supabase Dashboard > Settings > API:
- **Add your domain** to allowed origins
- **Enable credentials** if needed

### **Configure Rate Limiting**
- **Set up rate limiting** in your Supabase project
- **Monitor usage** in the dashboard

## 🚀 **STEP 8: DEPLOYMENT**

### **Environment Variables for Production**
Set these in your deployment platform (Vercel, Railway, etc.):

```env
NODE_ENV=production
SUPABASE_URL=your-production-url
SUPABASE_ANON_KEY=your-production-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-production-service-role-key
JWT_SECRET=your-production-jwt-secret
```

## ✅ **VERIFICATION CHECKLIST**

- [ ] Supabase project created
- [ ] Database schema deployed
- [ ] RLS policies configured
- [ ] Authentication enabled
- [ ] API keys copied
- [ ] Environment variables updated
- [ ] Test provider created
- [ ] Login/registration tested
- [ ] CORS configured
- [ ] Production deployment ready

## 🆘 **TROUBLESHOOTING**

### **Common Issues:**

1. **"Supabase client not available"**
   - Check environment variables are set correctly
   - Verify Supabase URL format

2. **"Invalid credentials"**
   - Ensure user exists in Supabase Auth
   - Check password requirements

3. **"Provider not found"**
   - Verify provider record exists in providers table
   - Check RLS policies

4. **Database connection errors**
   - Verify DATABASE_URL if using fallback
   - Check Supabase project status

## 📞 **SUPPORT**

If you encounter issues:
1. Check Supabase logs in the dashboard
2. Review server logs for detailed errors
3. Verify all environment variables are set
4. Test with a fresh provider registration

---

**🎉 Your Dr. Alex AI Provider Platform is now production-ready with Supabase authentication!**
