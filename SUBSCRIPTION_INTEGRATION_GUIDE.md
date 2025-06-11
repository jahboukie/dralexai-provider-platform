# 💰 **DR. ALEX AI SUBSCRIPTION INTEGRATION GUIDE**

## 🎯 **OVERVIEW**

This guide shows how to integrate the Dr. Alex AI subscription system with your landing page at **https://www.dralexai.com/** to create a seamless subscription flow that matches your exact pricing structure.

## ✅ **COMPLETED SETUP**

### **✅ Subscription Tiers Configured**
- **Essential:** $599/month, $5,990/annual
- **Professional:** $899/month, $8,990/annual  
- **Premium:** $1,299/month, $12,990/annual
- **Enterprise Essential:** $2,999/month (Contact Sales)
- **Enterprise Professional:** $9,999/month (Contact Sales)
- **Enterprise Unlimited:** $19,999/month (Contact Sales)

### **✅ Stripe Integration Complete**
- Test keys configured
- ALL price IDs mapped (Small/Medium + Enterprise)
- Webhook handlers implemented
- Payment processing ready for all tiers

### **✅ Landing Page CTAs**
- Direct link integration
- JavaScript integration
- Pricing toggle support
- Enterprise contact sales flow

## 🔗 **INTEGRATION OPTIONS**

### **Option 1: Direct Links (Simplest)**

Replace your current CTA buttons with direct links:

```html
<!-- Small & Medium Practice CTAs -->
<a href="/subscription-flow.html?plan=essential&billing=monthly" class="cta-button">
    Start Essential
</a>

<a href="/subscription-flow.html?plan=professional&billing=monthly" class="cta-button">
    Start Professional
</a>

<a href="/subscription-flow.html?plan=premium&billing=monthly" class="cta-button">
    Start Premium
</a>

<!-- Enterprise CTAs (Contact Sales OR Direct Purchase) -->
<a href="/subscription-flow.html?plan=enterprise_essential&billing=monthly&contactSales=true" class="cta-button">
    Contact Sales
</a>
<a href="/subscription-flow.html?plan=enterprise_essential&billing=monthly&contactSales=false" class="cta-button">
    Buy Enterprise Essential
</a>

<a href="/subscription-flow.html?plan=enterprise_professional&billing=monthly&contactSales=true" class="cta-button">
    Contact Sales
</a>
<a href="/subscription-flow.html?plan=enterprise_professional&billing=monthly&contactSales=false" class="cta-button">
    Buy Enterprise Professional
</a>

<a href="/subscription-flow.html?plan=enterprise_unlimited&billing=monthly&contactSales=true" class="cta-button">
    Contact Sales
</a>
<a href="/subscription-flow.html?plan=enterprise_unlimited&billing=monthly&contactSales=false" class="cta-button">
    Buy Enterprise Unlimited
</a>
```

### **Option 2: JavaScript Integration (Advanced)**

Add the integration script and use data attributes:

```html
<!-- Include integration script -->
<script src="/landing-page-integration.js"></script>

<!-- Pricing cards with data attributes -->
<div class="pricing-card" data-tier="professional">
    <h3>Professional</h3>
    <div class="price">$899/month</div>
    <button data-subscription-tier="professional" data-billing="monthly" class="cta-button">
        Start Professional
    </button>
</div>

<!-- Or call functions directly -->
<button onclick="DrAlexAISubscription.startSubscriptionFlow('essential', 'annual')">
    Start Essential (Annual)
</button>
```

### **Option 3: Pricing Toggle Integration**

For dynamic pricing with monthly/annual toggle:

```html
<!-- Billing toggle -->
<div class="billing-toggle">
    <label>
        <input type="radio" name="billing" value="monthly" checked> Monthly
    </label>
    <label>
        <input type="radio" name="billing" value="annual"> Annual (Save 10%)
    </label>
</div>

<!-- Pricing cards that update automatically -->
<div class="pricing-card" data-tier="professional">
    <div class="monthly-price">$899/month</div>
    <div class="annual-price" style="display: none;">$8,990/year</div>
    <button class="cta-button" data-subscription-tier="professional">
        Start Professional
    </button>
</div>
```

## 🏗️ **SUBSCRIPTION FLOW**

### **Small & Medium Practices Flow:**
1. **User clicks CTA** → Subscription flow page
2. **Plan selection** → Contact information form
3. **Stripe checkout** → Payment processing
4. **Success page** → Account setup instructions

### **Enterprise Flow:**
1. **User clicks CTA** → Subscription flow page
2. **Plan selection** → Contact information form
3. **Sales lead created** → 24-hour contact promise
4. **Success page** → Sales team follow-up

## 🎨 **CURRENT PRICING STRUCTURE**

### **Small & Medium Practices**

| Tier | Monthly | Annual | AI Queries | Providers | Patients |
|------|---------|--------|------------|-----------|----------|
| **Essential** | $599 | $5,990 | 100 | 1 | 100 |
| **Professional** | $899 | $8,990 | 180 | 3 | 300 |
| **Premium** | $1,299 | $12,990 | 300 | 5 | 500 |

### **Enterprise**

| Tier | Monthly | Annual | AI Queries | Providers | Patients |
|------|---------|--------|------------|-----------|----------|
| **Enterprise Essential** | $2,999 | $29,990 | 500 | 10 | 1,000 |
| **Enterprise Professional** | $9,999 | $99,990 | 2,000 | 50 | 5,000 |
| **Enterprise Unlimited** | $19,999 | $199,990 | Unlimited | Unlimited | Unlimited |

## 🔧 **STRIPE CONFIGURATION**

### **Test Environment (Current)**
```env
STRIPE_PUBLISHABLE_KEY=pk_test_[CONFIGURED]
STRIPE_SECRET_KEY=sk_test_[CONFIGURED]
```

### **Price IDs Configured (ALL TIERS)**

**Small & Medium Practices:**
- **Essential Monthly:** `price_1RYoJmELGHd3NbdJGIdnCsqf`
- **Essential Annual:** `price_1RYoTlELGHd3NbdJMPdg5hGv`
- **Professional Monthly:** `price_1RYoPVELGHd3NbdJJvCLCeqD`
- **Professional Annual:** `price_1RYoVaELGHd3NbdJdwNWNysa`
- **Premium Monthly:** `price_1RYobAELGHd3NbdJxhJ2UaGw`
- **Premium Annual:** `price_1RYoblELGHd3NbdJaoVpRfkm`

**Enterprise:**
- **Enterprise Essential Monthly:** `price_1RYohsELGHd3NbdJIvRLo95u`
- **Enterprise Essential Annual:** `price_1RYoiSELGHd3NbdJdmx76AR8`
- **Enterprise Professional Monthly:** `price_1RYp7HELGHd3NbdJR6mYYwcy`
- **Enterprise Professional Annual:** `price_1RYp7HELGHd3NbdJWyGeTqf5`
- **Enterprise Unlimited Monthly:** `price_1RYpIEELGHd3NbdJzU1KqPIv`
- **Enterprise Unlimited Annual:** `price_1RYpIEELGHd3NbdJX0Bk5VDb`

## 🚀 **DEPLOYMENT STEPS**

### **Step 1: Update Landing Page CTAs**
Replace your current subscription buttons with the integration code above.

### **Step 2: Test Integration**
1. Visit: `http://localhost:3004/landing-page-cta-examples.html`
2. Test each subscription tier
3. Verify Stripe checkout works
4. Test enterprise contact sales flow

### **Step 3: Configure Webhooks**
1. In Stripe Dashboard → Webhooks
2. Add endpoint: `https://your-domain.com/api/stripe/webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

### **Step 4: Production Deployment**
1. Update environment variables with production Stripe keys
2. Deploy subscription system
3. Update landing page with production URLs
4. Test end-to-end flow

## 📊 **ANALYTICS & TRACKING**

The integration includes automatic tracking for:
- **Subscription starts** by tier and billing cycle
- **Enterprise inquiries** with lead source
- **Conversion funnel** from landing page to payment
- **Payment success/failure** rates

## 🔒 **SECURITY FEATURES**

- **Stripe-hosted checkout** for PCI compliance
- **Webhook signature verification** for security
- **Encrypted customer data** storage
- **HIPAA-compliant** subscription management

## 🆘 **TROUBLESHOOTING**

### **Common Issues:**

1. **"Subscription tiers not loading"**
   - Check API endpoint: `/api/subscription/tiers`
   - Verify server is running

2. **"Stripe checkout not working"**
   - Verify Stripe keys in environment
   - Check price IDs match configuration

3. **"Enterprise contact sales not working"**
   - Check database connection
   - Verify sales_leads table exists

### **Test Endpoints:**
- **Subscription Tiers:** `GET /api/subscription/tiers`
- **Start Subscription:** `POST /api/subscription/start`
- **Webhook Handler:** `POST /api/stripe/webhook`

## 📞 **NEXT STEPS**

1. **✅ ALL tiers configured** with your Stripe price IDs
2. **✅ Enterprise direct purchase** enabled alongside contact sales
3. **🔄 Production deployment** when ready
4. **🔄 Landing page integration** when you're ready

## 🎉 **READY TO INTEGRATE!**

Your subscription system is now fully aligned with your landing page pricing and ready for integration. The system handles:

- ✅ **Exact pricing match** with landing page
- ✅ **Stripe payment processing** 
- ✅ **Enterprise contact sales** flow
- ✅ **Subscription management**
- ✅ **Usage tracking** and limits
- ✅ **Webhook handling** for automation

**Test the integration at:** `http://localhost:3004/landing-page-cta-examples.html`
