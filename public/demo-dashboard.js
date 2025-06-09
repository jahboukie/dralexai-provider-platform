/**
 * Demo Dashboard JavaScript
 * Standalone demo experience with no authentication required
 */

// Demo data and configuration
const demoConfig = {
    organizationType: 'small_practice', // Default, can be detected from URL params
    currentSection: 'overview',
    chatHistory: []
};

// Initialize demo dashboard
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Demo Dashboard initialized');
    
    // Check for organization type in URL params
    const urlParams = new URLSearchParams(window.location.search);
    const orgType = urlParams.get('org');
    if (orgType) {
        demoConfig.organizationType = orgType;
    }
    
    // Initialize chat input
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendDemoMessage();
            }
        });
    }
    
    // Show welcome message based on organization type
    showWelcomeMessage();
});

// Show section navigation
function showSection(sectionName) {
    // Hide all sections
    const sections = document.querySelectorAll('.dashboard-section');
    sections.forEach(section => section.classList.remove('active'));
    
    // Show selected section
    const targetSection = document.getElementById(sectionName + '-section');
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Update navigation
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => link.classList.remove('active'));
    
    const activeLink = document.querySelector(`[onclick="showSection('${sectionName}')"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
    
    demoConfig.currentSection = sectionName;
}

// Show demo feature with explanation
function showDemoFeature(featureName) {
    const features = {
        patients: {
            title: '👥 Patient Management System',
            description: `
                <div class="feature-demo">
                    <h3>Comprehensive Patient Management</h3>
                    <ul>
                        <li><strong>Secure Patient Records:</strong> HIPAA-compliant data management with zero-knowledge encryption</li>
                        <li><strong>AI-Powered Insights:</strong> Automated risk assessment and treatment recommendations</li>
                        <li><strong>Real-time Monitoring:</strong> Continuous health tracking with mobile app integration</li>
                        <li><strong>Crisis Detection:</strong> Immediate alerts for emergency situations</li>
                    </ul>
                    <div class="demo-screenshot">
                        <p><em>In the full version, you'd see patient dashboards, health trends, and AI-generated insights.</em></p>
                    </div>
                </div>
            `
        },
        analytics: {
            title: '📈 Advanced Analytics Dashboard',
            description: `
                <div class="feature-demo">
                    <h3>Predictive Healthcare Analytics</h3>
                    <ul>
                        <li><strong>Population Health Insights:</strong> Aggregate data analysis across patient populations</li>
                        <li><strong>Treatment Efficacy Tracking:</strong> Measure outcomes and optimize protocols</li>
                        <li><strong>Risk Stratification:</strong> AI-powered patient risk scoring and intervention recommendations</li>
                        <li><strong>ROI Analytics:</strong> Track cost savings and efficiency improvements</li>
                    </ul>
                    <div class="demo-metrics-preview">
                        <div class="metric-card">
                            <h4>94.7%</h4>
                            <p>Diagnostic Accuracy</p>
                        </div>
                        <div class="metric-card">
                            <h4>$284K</h4>
                            <p>Annual Savings</p>
                        </div>
                        <div class="metric-card">
                            <h4>40%</h4>
                            <p>Admin Reduction</p>
                        </div>
                    </div>
                </div>
            `
        },
        crisis: {
            title: '🚨 Crisis Management System',
            description: `
                <div class="feature-demo">
                    <h3>Real-time Crisis Detection & Response</h3>
                    <ul>
                        <li><strong>AI Crisis Detection:</strong> Automatic identification of emergency situations</li>
                        <li><strong>Immediate Protocols:</strong> Instant activation of intervention procedures</li>
                        <li><strong>Emergency Contacts:</strong> Automated notification of crisis response teams</li>
                        <li><strong>Documentation:</strong> Complete audit trail for compliance and review</li>
                    </ul>
                    <div class="crisis-demo">
                        <div class="alert-example">
                            <strong>🚨 CRISIS ALERT EXAMPLE:</strong><br>
                            "High-risk patient indicators detected. Emergency protocol activated. Crisis intervention team notified."
                        </div>
                    </div>
                </div>
            `
        },
        security: {
            title: '🛡️ Zero-Knowledge Security Architecture',
            description: `
                <div class="feature-demo">
                    <h3>Military-Grade Healthcare Security</h3>
                    <ul>
                        <li><strong>Zero-Knowledge Encryption:</strong> Your data never leaves your control unencrypted</li>
                        <li><strong>Triple Compliance:</strong> HIPAA (US) + PIPEDA (Canada) + GDPR (EU)</li>
                        <li><strong>SOC 2 Type II Certified:</strong> Enterprise-grade security infrastructure</li>
                        <li><strong>Multi-Factor Authentication:</strong> Mandatory MFA with biometric options</li>
                    </ul>
                    <div class="security-badges">
                        <span class="badge">🛡️ HIPAA Compliant</span>
                        <span class="badge">🔒 SOC 2 Type II</span>
                        <span class="badge">🌍 GDPR Ready</span>
                        <span class="badge">🇨🇦 PIPEDA Certified</span>
                    </div>
                </div>
            `
        },
        ehr: {
            title: '🏥 EHR Integration Hub',
            description: `
                <div class="feature-demo">
                    <h3>Seamless Healthcare System Integration</h3>
                    <ul>
                        <li><strong>Epic Integration:</strong> Real-time data sync with Epic EHR systems</li>
                        <li><strong>Cerner Connectivity:</strong> Native integration with Cerner platforms</li>
                        <li><strong>HL7 FHIR Support:</strong> Standards-based interoperability</li>
                        <li><strong>Custom APIs:</strong> Connect with any healthcare system</li>
                    </ul>
                    <div class="integration-flow">
                        <p><em>EHR Data → AI Processing → Clinical Insights → Back to EHR</em></p>
                    </div>
                </div>
            `
        },
        billing: {
            title: '💰 Intelligent Billing & Analytics',
            description: `
                <div class="feature-demo">
                    <h3>Automated Revenue Optimization</h3>
                    <ul>
                        <li><strong>Usage Analytics:</strong> Track AI query usage and ROI metrics</li>
                        <li><strong>Cost Optimization:</strong> Identify opportunities for efficiency gains</li>
                        <li><strong>Subscription Management:</strong> Flexible tier upgrades and downgrades</li>
                        <li><strong>ROI Reporting:</strong> Detailed cost-benefit analysis</li>
                    </ul>
                    <div class="pricing-preview">
                        <p><strong>Your estimated ROI:</strong> $${getPricingForOrg(demoConfig.organizationType).roi}</p>
                    </div>
                </div>
            `
        }
    };
    
    const feature = features[featureName];
    if (feature) {
        document.getElementById('demo-feature-title').innerHTML = feature.title;
        document.getElementById('demo-feature-description').innerHTML = feature.description;
        showSection('demo-feature');
    }
}

// Send demo message to AI
async function sendDemoMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Add user message to chat
    addMessageToChat('user', message);
    input.value = '';
    
    // Show typing indicator
    showTypingIndicator();
    
    try {
        // Call the actual AI assistant API in demo mode
        const response = await fetch('/api/ai-assistant/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer demo-token' // Special demo token
            },
            body: JSON.stringify({
                message: message,
                context: {
                    demo_mode: true,
                    organization_type: demoConfig.organizationType,
                    section: demoConfig.currentSection
                }
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            removeTypingIndicator();
            addMessageToChat('ai', data.response);
        } else {
            throw new Error('API call failed');
        }
    } catch (error) {
        console.error('Demo AI error:', error);
        removeTypingIndicator();
        
        // Fallback to demo responses
        const demoResponse = generateDemoResponse(message);
        addMessageToChat('ai', demoResponse);
    }
}

// Generate demo response for fallback
function generateDemoResponse(message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('pricing') || lowerMessage.includes('cost')) {
        const pricing = getPricingForOrg(demoConfig.organizationType);
        return `For ${demoConfig.organizationType.replace('_', ' ')}, I recommend our ${pricing.tier} tier at ${pricing.price}. This provides ${pricing.features} with an estimated ROI of ${pricing.roi} annually. Would you like to schedule a demo to see the full capabilities?`;
    }
    
    if (lowerMessage.includes('security') || lowerMessage.includes('compliance')) {
        return `Our security architecture is unique in healthcare AI. We're the only platform with true zero-knowledge encryption plus triple compliance (HIPAA + PIPEDA + GDPR). Your patient data never leaves your control unencrypted. We're SOC 2 Type II certified with 99.99% uptime. Would you like me to explain our security differentiators in detail?`;
    }
    
    if (lowerMessage.includes('demo') || lowerMessage.includes('trial')) {
        return `I'd be happy to arrange a personalized demo! Our 30-day pilot program includes full platform access with money-back guarantee. You'll get dedicated integration support and clinical training. Shall I connect you with our demo team to schedule a live session?`;
    }
    
    return `Thank you for your question about "${message}". In this demo mode, I can show you our clinical decision support, security features, pricing options, and platform capabilities. What specific aspect would you like to explore? I can also connect you with our team for a personalized demonstration.`;
}

// Get pricing based on organization type
function getPricingForOrg(orgType) {
    const pricing = {
        solo_practice: {
            tier: 'Essential',
            price: '$2,999/month',
            features: '1,000 AI queries, basic EHR integration',
            roi: '$120,000+'
        },
        small_practice: {
            tier: 'Professional',
            price: '$9,999/month',
            features: '5,000 AI queries, advanced analytics',
            roi: '$500,000+'
        },
        health_system: {
            tier: 'Enterprise Professional',
            price: '$19,999/month',
            features: 'Unlimited queries, full integration',
            roi: '$1,200,000+'
        },
        enterprise: {
            tier: 'Enterprise Unlimited',
            price: 'Custom pricing',
            features: 'White-label deployment, custom development',
            roi: '$2,000,000+'
        }
    };
    
    return pricing[orgType] || pricing.small_practice;
}

// Chat utility functions
function addMessageToChat(sender, message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = sender === 'user' 
        ? `<strong>You:</strong> ${message}`
        : `<strong>Dr. Alex AI:</strong> ${message}`;
    
    messageDiv.appendChild(content);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    demoConfig.chatHistory.push({ sender, message, timestamp: new Date() });
}

function showTypingIndicator() {
    const chatMessages = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message ai-message typing-indicator';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = '<div class="message-content"><strong>Dr. Alex AI:</strong> <em>Thinking...</em></div>';
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

// Demo action functions
function startTrial() {
    alert('🚀 Ready to start your free trial! This would redirect to our signup process with your demo conversation history preserved.');
}

function scheduleDemo() {
    alert('📅 Demo scheduling! This would open our calendar booking system for a personalized live demonstration.');
}

function viewPricing() {
    const pricing = getPricingForOrg(demoConfig.organizationType);
    alert(`💰 Pricing for ${demoConfig.organizationType.replace('_', ' ')}:\n\n${pricing.tier}: ${pricing.price}\n${pricing.features}\nEstimated ROI: ${pricing.roi} annually`);
}

function exitDemo() {
    if (confirm('Exit demo and return to main site?')) {
        window.location.href = '/';
    }
}

function showWelcomeMessage() {
    const orgType = demoConfig.organizationType.replace('_', ' ');
    const pricing = getPricingForOrg(demoConfig.organizationType);
    
    setTimeout(() => {
        addMessageToChat('ai', `Welcome to Dr. Alex AI! I've detected you're interested in solutions for a ${orgType}. I recommend our ${pricing.tier} tier (${pricing.price}) which would provide ${pricing.roi} in annual ROI. Feel free to explore the platform and ask me any questions!`);
    }, 1000);
}
