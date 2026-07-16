import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

// Load environment variables
dotenv.config();

// Initialize Gemini SDK with telemetry header
const geminiApiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (geminiApiKey) {
  try {
    ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log('Gemini API client initialized successfully.');
  } catch (error) {
    console.error('Error initializing Gemini client:', error);
  }
} else {
  console.warn('GEMINI_API_KEY is not defined. AI Assistant features will return beautiful mock assistance responses.');
}

// Import initial data to seed the server-side in-memory database
import { INITIAL_NEWS, INITIAL_EVENTS, INITIAL_MEMBERS } from './src/data.js';
import { NewsArticle, Event, MemberOrg, EventRegistration, VolunteerApplication, MembershipApplication, ComplaintSubmission, DonationSubmission, ContactSubmission } from './src/types.js';

// In-Memory Database (synchronized with user actions)
let newsArticles: NewsArticle[] = [...INITIAL_NEWS];
let events: Event[] = [...INITIAL_EVENTS];
let members: MemberOrg[] = [...INITIAL_MEMBERS];

// Storage for online forms
let registrations: EventRegistration[] = [];
let volunteers: VolunteerApplication[] = [];
let memberships: MembershipApplication[] = [];
let complaints: ComplaintSubmission[] = [];
let donations: DonationSubmission[] = [];
let contacts: ContactSubmission[] = [];

const app = express();
const PORT = 3000;

app.use(express.json());

// =================== BACKEND REST API ENDPOINTS ===================

// News API (CMS)
app.get('/api/news', (req, res) => {
  res.json(newsArticles);
});

app.post('/api/news', (req, res) => {
  const { title, content, image, category, author, tags } = req.body;
  if (!title || !content) {
    res.status(400).json({ error: 'Title and content are required' });
    return;
  }
  const newArticle: NewsArticle = {
    id: `news-${Date.now()}`,
    title,
    content,
    image: image || 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&q=80&w=800',
    category: category || 'General',
    date: new Date().toISOString().split('T')[0],
    author: author || 'Admin Officer',
    tags: tags || []
  };
  newsArticles.unshift(newArticle);
  res.status(201).json(newArticle);
});

app.put('/api/news/:id', (req, res) => {
  const { id } = req.params;
  const { title, content, image, category, author, tags } = req.body;
  const index = newsArticles.findIndex(art => art.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'Article not found' });
    return;
  }
  const updatedArticle: NewsArticle = {
    ...newsArticles[index],
    title: title || newsArticles[index].title,
    content: content || newsArticles[index].content,
    image: image || newsArticles[index].image,
    category: category || newsArticles[index].category,
    author: author || newsArticles[index].author,
    tags: tags || newsArticles[index].tags
  };
  newsArticles[index] = updatedArticle;
  res.json(updatedArticle);
});

app.delete('/api/news/:id', (req, res) => {
  const { id } = req.params;
  const initialLen = newsArticles.length;
  newsArticles = newsArticles.filter(art => art.id !== id);
  if (newsArticles.length === initialLen) {
    res.status(404).json({ error: 'Article not found' });
    return;
  }
  res.json({ success: true, message: 'Article deleted successfully' });
});

// Events API
app.get('/api/events', (req, res) => {
  res.json(events);
});

app.post('/api/events', (req, res) => {
  const { title, description, date, time, location, image, capacity, category, organizer } = req.body;
  if (!title || !date || !location) {
    res.status(400).json({ error: 'Title, Date, and Location are required' });
    return;
  }
  const newEvent: Event = {
    id: `evt-${Date.now()}`,
    title,
    description: description || '',
    date,
    time: time || '10:00 AM - 12:00 PM',
    location,
    image: image || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&q=80&w=800',
    capacity: Number(capacity) || 100,
    registeredCount: 0,
    category: category || 'Community',
    organizer: organizer || 'SDHO Organizers'
  };
  events.push(newEvent);
  res.status(201).json(newEvent);
});

// Event Registration API (with automatic QR code ticketing)
app.post('/api/events/:id/register', (req, res) => {
  const { id } = req.params;
  const { fullName, email, phone, specialRequirements } = req.body;

  if (!fullName || !email || !phone) {
    res.status(400).json({ error: 'Full Name, Email, and Phone are required' });
    return;
  }

  const eventIndex = events.findIndex(evt => evt.id === id);
  if (eventIndex === -1) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  const event = events[eventIndex];
  if (event.registeredCount >= event.capacity) {
    res.status(400).json({ error: 'Event is at full capacity' });
    return;
  }

  // Update registration count
  event.registeredCount += 1;

  const ticketCode = `SDHO-${id.substring(4)}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const registration: EventRegistration = {
    id: `reg-${Date.now()}`,
    eventId: id,
    fullName,
    email,
    phone,
    specialRequirements,
    ticketCode,
    registeredAt: new Date().toISOString()
  };

  registrations.push(registration);
  res.status(201).json({
    success: true,
    registration,
    eventTitle: event.title,
    eventDate: event.date,
    eventTime: event.time,
    eventLocation: event.location
  });
});

// Member Directory API
app.get('/api/members', (req, res) => {
  res.json(members);
});

app.post('/api/members', (req, res) => {
  const { name, category, region, services, logo, description, phone, email, address, website, established, membersCount } = req.body;
  if (!name || !category || !region) {
    res.status(400).json({ error: 'Organization name, category, and region are required' });
    return;
  }

  const categoryLabels: Record<string, string> = {
    blind: 'Visual Impairment',
    deaf: 'Deaf & Hearing Impairment',
    physical: 'Physical Disability',
    mental: 'Developmental Disability',
    general: 'Cross-Disability Network',
    women: 'Women & Girls Focus',
    youth: 'Youth Empowerment'
  };

  const regionLabels: Record<string, string> = {
    'maroodi-jeex': 'Maroodi-Jeex (Hargeisa)',
    toghdeer: 'Togdheer (Burao)',
    awdal: 'Awdal (Borama)',
    sanaag: 'Sanaag (Erigavo)',
    sool: 'Sool (Las Anod)',
    sahil: 'Sahil (Berbera)'
  };

  const newMember: MemberOrg = {
    id: `mem-${Date.now()}`,
    name,
    category,
    region,
    categoryLabel: categoryLabels[category] || 'Specialized Services',
    regionLabel: regionLabels[region] || 'Other Region',
    services: services || [],
    logo: logo || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200&h=200',
    description: description || '',
    phone: phone || '+252 63 XXXXXXX',
    email: email || 'info@member.org.so',
    address: address || 'Somaliland',
    website,
    established: established || '2026',
    membersCount: Number(membersCount) || 10
  };

  members.push(newMember);
  res.status(201).json(newMember);
});

// Volunteer Registration API
app.post('/api/forms/volunteer', (req, res) => {
  const { fullName, email, phone, region, skills, availability, motivation } = req.body;
  if (!fullName || !email || !phone) {
    res.status(400).json({ error: 'Name, email, and phone are required' });
    return;
  }
  const newVolunteer: VolunteerApplication = {
    id: `vol-${Date.now()}`,
    fullName,
    email,
    phone,
    region: region || 'Maroodi-Jeex',
    skills: skills || [],
    availability: availability || 'Flexible',
    motivation: motivation || '',
    appliedAt: new Date().toISOString()
  };
  volunteers.push(newVolunteer);
  res.status(201).json({ success: true, volunteer: newVolunteer });
});

// Membership Application API
app.post('/api/forms/membership', (req, res) => {
  const { orgName, representativeName, email, phone, region, category, description } = req.body;
  if (!orgName || !representativeName || !email || !phone) {
    res.status(400).json({ error: 'Organization name, representative, email, and phone are required' });
    return;
  }
  const newMembership: MembershipApplication = {
    id: `mbr-${Date.now()}`,
    orgName,
    representativeName,
    email,
    phone,
    region: region || 'Maroodi-Jeex',
    category: category || 'general',
    description: description || '',
    appliedAt: new Date().toISOString()
  };
  memberships.push(newMembership);
  res.status(201).json({ success: true, application: newMembership });
});

// Complaint Form API
app.post('/api/forms/complaint', (req, res) => {
  const { fullName, email, phone, subject, description, isAnonymous } = req.body;
  if (!description || (!isAnonymous && (!fullName || !email))) {
    res.status(400).json({ error: 'Description is required. For non-anonymous filings, name and email are required.' });
    return;
  }
  const newComplaint: ComplaintSubmission = {
    id: `cmp-${Date.now()}`,
    fullName: isAnonymous ? 'Anonymous' : fullName,
    email: isAnonymous ? 'anonymous@sdho.org' : email,
    phone: isAnonymous ? '' : (phone || ''),
    subject: subject || 'General Complaint',
    description,
    isAnonymous: !!isAnonymous,
    submittedAt: new Date().toISOString()
  };
  complaints.push(newComplaint);
  res.status(201).json({ success: true, complaint: newComplaint });
});

// Donation Form API
app.post('/api/forms/donation', (req, res) => {
  const { fullName, email, phone, amount, type, method, sponsorTarget } = req.body;
  if (!amount || !method) {
    res.status(400).json({ error: 'Amount and payment method are required' });
    return;
  }

  const transactionId = `TXN-${method.toUpperCase()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

  const newDonation: DonationSubmission = {
    id: `don-${Date.now()}`,
    fullName: fullName || 'Anonymous Donor',
    email: email || 'anonymous@donor.org',
    phone: phone || '',
    amount: Number(amount),
    type: type || 'one-time',
    frequency: type === 'one-time' ? 'One Time' : type === 'monthly' ? 'Monthly' : 'Annual Sponsorship',
    method,
    sponsorTarget,
    submittedAt: new Date().toISOString(),
    transactionId
  };
  donations.push(newDonation);
  res.status(201).json({ success: true, donation: newDonation });
});

// Contact Submission API
app.post('/api/forms/contact', (req, res) => {
  const { fullName, email, phone, subject, message } = req.body;
  if (!fullName || !email || !message) {
    res.status(400).json({ error: 'Name, email, and message are required' });
    return;
  }
  const newContact: ContactSubmission = {
    id: `cnt-${Date.now()}`,
    fullName,
    email,
    phone: phone || '',
    subject: subject || 'General Query',
    message,
    submittedAt: new Date().toISOString()
  };
  contacts.push(newContact);
  res.status(201).json({ success: true, contact: newContact });
});

// Admin Metrics Dashboard API
app.get('/api/admin/metrics', (req, res) => {
  const totalDonations = donations.reduce((sum, d) => sum + d.amount, 0);
  res.json({
    counts: {
      news: newsArticles.length,
      events: events.length,
      members: members.length,
      registrations: registrations.length,
      volunteers: volunteers.length,
      memberships: memberships.length,
      complaints: complaints.length,
      donations: donations.length,
      contacts: contacts.length
    },
    totalDonations,
    recentDonations: donations.slice(-5).reverse(),
    recentRegistrations: registrations.slice(-5).reverse(),
    recentVolunteers: volunteers.slice(-5).reverse(),
    recentComplaints: complaints.slice(-5).reverse()
  });
});

// =================== SERVER-SIDE GEMINI API INTEGRATION ===================

app.post('/api/ai/chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    res.status(400).json({ error: 'Message content is required.' });
    return;
  }

  // If Gemini client is not initialized, fallback to a smart, helpful system rule
  if (!ai) {
    console.warn('Fallback assistant: Generating mock response');
    const lower = message.toLowerCase();
    let reply = "Hello! I am the Somaliland Disability and Handicap Organization (SDHO) Assistant. ";
    
    if (lower.includes('somali') || lower.includes('afka') || lower.includes('ku hadashaa')) {
      reply = "Haa, waan ku hadlaa Af-Somali! Waxaan ahay caawiyahaaga SDHO. Sideen maanta kuu caawin karaa? Waxaad iga weydiin kartaa adeegyada aan bixino, xuquuqda naafada Somaliland, iyo sida aad uga qeyb qaadan karto.";
    } else if (lower.includes('contact') || lower.includes('location') || lower.includes('phone') || lower.includes('address')) {
      reply += "You can contact our main office in Hargeisa at Pepsi Area, or call us at +252 63 4410101. You can also submit the Contact Form in our contact section.";
    } else if (lower.includes('volunteer') || lower.includes('join')) {
      reply += "We would love to have you! You can apply online using the 'Volunteer Registration Form' under our Online Forms page. We match volunteers based on skills like sign language, mobility aid coordination, and teaching support.";
    } else if (lower.includes('donate') || lower.includes('zaad') || lower.includes('money') || lower.includes('edahab')) {
      reply += "Thank you for your generosity! We accept direct donations via Telesom ZAAD and Somtel e-Dahab. You can complete our Donation Form to receive an instant receipt and track your impact.";
    } else if (lower.includes('member') || lower.includes('directory') || lower.includes('association')) {
      reply += "We represent a wide network of local organizations, including the Somaliland National Association of the Deaf (SNAD), Somaliland Association of the Blind (SAB), and many regional physical disability centres. You can browse them in our Member Directory tab.";
    } else if (lower.includes('program') || lower.includes('education') || lower.includes('healthcare')) {
      reply += "Our core programs include: 1. Inclusive Primary & Higher Education, 2. Accessible Healthcare & Medical Referrals, 3. Livelihoods & Technical Trade Training, 4. Rights Advocacy & Legal Aid, and 5. Assistive Devices Distribution. You can learn more details in our Programs section.";
    } else {
      reply += "I can assist you with navigating our services, locating member organizations in Hargeisa, Borama, and Burao, details on our rights advocacy, registering for upcoming events, or filing feedback/complaints. What would you like to know?";
    }
    res.json({ reply });
    return;
  }

  try {
    const formattedHistory = (history || []).map((msg: any) => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    // Add a strict system prompt to instruct Gemini to act as SDHO accessibility agent
    const systemPrompt = `You are the Official AI Accessibility and Information Assistant for the Somaliland Disability and Handicap Organization (SDHO).
Your goal is to assist persons with visual, auditory, physical, and developmental disabilities, their families, and international partners.
Support multi-lingual requests gracefully. Always respond in the language the user prompts you (e.g., Somali, English, or Arabic).
Keep your tone warm, accessible, highly inclusive, clear, and reassuring.

If requested about SDHO details, refer to these real organizational facts:
- Tagline: "Together We Stand for Inclusion"
- Office location: Pepsi Area, near Hargeisa, Somaliland.
- Phone number: +252 63 4410101
- Email: contact@sdho-somaliland.org
- Programs: Inclusive Education, Healthcare Referrals, Vocational Livelihoods, Rights Advocacy & Legal Assistance, Assistive Device Distribution, Climate Relief.
- Associated organizations include SNAD (Deaf), SAB (Blind), and regional networks in Togdheer, Awdal, Sanaag, Sool, and Sahil.
- Users can fill forms online directly on this site: Volunteer Application, Membership Request, Confidential Complaint Submission, or Donation via ZAAD and e-Dahab.

You can also explain the built-in accessibility features on the page, like the Floating Toolbar which contains High Contrast, Dark Mode, Font resizing, and a Screen Reader.

Keep your answers structured and easy to digest, using short paragraphs or bullet points.`;

    const chatSession = ai.chats.create({
      model: 'gemini-3.5-flash',
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      },
      history: formattedHistory
    });

    const response = await chatSession.sendMessage({ message });
    res.json({ reply: response.text });
  } catch (err: any) {
    console.error('Error in Gemini API call:', err);
    res.status(500).json({ error: 'Failed to generate response from Gemini. Please try again.', details: err.message });
  }
});

// =================== VITE INTEGRATION / STATIC SERVING ===================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // Integrate Vite dev server middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve compiled static assets
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start Server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on http://0.0.0.0:${PORT}`);
  });
}

startServer();
