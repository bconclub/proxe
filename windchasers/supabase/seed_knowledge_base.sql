-- ============================================================================
-- WINDCHASERS KNOWLEDGE BASE SEED DATA
-- Generated from windchasers.in website content
-- Run AFTER migrations 029, 030, 031
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ABOUT WINDCHASERS
-- ============================================================================

INSERT INTO knowledge_base (title, question, answer, category, subcategory, type, embeddings_status) VALUES
(
  'What is Wind Chasers?',
  'What is Wind Chasers?',
  'Wind Chasers is a premier pilot training academy based in Bangalore, India. Founded by Sumaiya Ali, inspired by her daughter Rida''s dream to become a pilot. Wind Chasers offers top-tier pilot training programs including DGCA Ground Classes and international pilot training with leading flight schools across USA, New Zealand, Canada, India, Australia, and South Africa. The academy provides personalized instruction, interactive live classrooms, and continuous support on your path to becoming a pilot.',
  'about',
  'company',
  'text',
  'ready'
),
(
  'Who founded Wind Chasers?',
  'Who founded Wind Chasers?',
  'Wind Chasers was founded by Sumaiya Ali. She was inspired by her daughter Rida Ali''s dream to become a pilot. While researching the aviation industry to support her daughter''s aspirations, she realized many parents faced similar challenges navigating the unfamiliar field of aviation education. This led her to create Wind Chasers to break down barriers in aviation education and provide clear pathways to success for aspiring aviators.',
  'about',
  'founder',
  'text',
  'ready'
),
(
  'Where is Wind Chasers located?',
  'Where is Wind Chasers located?',
  'Wind Chasers is headquartered in Bangalore, India. The office operates from 10:30 AM to 7:30 PM. You can reach them at phone: +91 9035098425 or +91 9591004043, or email: aviators@windchasers.in. They also have social media presence on Facebook, Instagram, and LinkedIn under the handle @windchasersblr.',
  'about',
  'contact',
  'text',
  'ready'
),
(
  'How to contact Wind Chasers?',
  'How can I contact Wind Chasers?',
  'You can contact Wind Chasers through the following channels:
- Phone: +91 9035098425 or +91 9591004043
- Email: aviators@windchasers.in
- Website: https://windchasers.in
- Facebook: facebook.com/windchasersblr
- Instagram: instagram.com/windchasersblr
- LinkedIn: linkedin.com/company/windchasersblr
Office hours: 10:30 AM to 7:30 PM, Bangalore, India.',
  'about',
  'contact',
  'text',
  'ready'
),
(
  'Wind Chasers media coverage',
  'Has Wind Chasers been featured in the media?',
  'Yes, Wind Chasers has been featured in several major publications including:
- Silicon India
- Deccan Chronicle
- Financial Express
- The Hindu
These features cover topics like aviation training in India, the effectiveness of pilot training curricula, and opportunities for Indian pilots abroad.',
  'about',
  'media',
  'text',
  'ready'
),
(
  'What support services does Wind Chasers provide?',
  'What support services does Wind Chasers offer to students?',
  'Wind Chasers provides comprehensive support services including:
1. Educational Loan Support - assistance with financing your training
2. Enrollment Support - help with admission processes
3. Visa Documentation - assistance with visa paperwork for international training
4. Immigration Support - guidance on immigration requirements
5. Accommodation Support - help finding housing at training locations
6. Continuous Student Guidance - ongoing mentorship throughout your training journey',
  'about',
  'services',
  'text',
  'ready'
),

-- ============================================================================
-- 2. PILOT CERTIFICATIONS / COURSES
-- ============================================================================

(
  'Private Pilot License (PPL)',
  'What is the Private Pilot License program?',
  'The Private Pilot License (PPL) is the first step in becoming a pilot. At Wind Chasers, PPL training is aligned with DGCA standards.

Eligibility Requirements:
- Minimum age: 17 years old
- Education: 10th standard completion or equivalent
- Medical: DGCA Class 2 Medical certificate required

Flight Training Hours:
- Total Flying Time: 50 hours minimum
- Pilot-in-Command (PIC): 20 hours
- Cross Country: 5 hours
- Additional Training: 25 hours (skills & emergency procedures)

Theoretical Examinations: Air Regulations, Aviation Meteorology, Air Navigation, RTR(A), Aircraft Technical General

Practical Assessments: Ground evaluation (oral examination) and General Flying Test by Day demonstrating cross-country navigation and emergency maneuvers.

Note: Training hour requirements follow DGCA guidelines but may vary by country.',
  'courses',
  'pilot_license',
  'text',
  'ready'
),
(
  'Commercial Pilot License (CPL)',
  'What is the Commercial Pilot License program?',
  'The Commercial Pilot License (CPL) program at Wind Chasers is designed for aspiring pilots to advance from private pilot status to professional aviation careers.

Eligibility Requirements:
- Minimum age: 18 years old
- Education: Completed 10th grade plus two additional years with focus on physics and mathematics
- Medical: Class 1 Medical examination required

Training Hours Breakdown:
- Total Flying Hours: 200
- Pilot-in-Command (PIC): 100
- Cross-Country PIC: 50
- Instrument Time (Aircraft): 20
- Instrument Time (Simulator): 20
- Night PIC Hours: 5

Theory Examinations: Air Regulations, Air Navigation, Composite Exams, Aircraft Technical Knowledge, RTR(A)

Check Ride Requirements:
- General Flying Test by Day
- General Flying Test by Night
- Cross-Country Flight Test by Day (250nm)
- Cross-Country Flying Test by Night (120nm)
- Instrument Rating Test
- Ground Evaluation (Oral)

Hours are in accordance with DGCA standards but may vary by country.',
  'courses',
  'pilot_license',
  'text',
  'ready'
),
(
  'Certified Flight Instructor (CFI)',
  'What is the Certified Flight Instructor program?',
  'The Certified Flight Instructor (CFI) program at Wind Chasers prepares pilots to instruct others in aircraft operation and aviation knowledge. Becoming a CFI can be a pivotal step in your aviation career, providing opportunities to rapidly accumulate flight experience.

Prerequisites:
- Commercial Pilot License (CPL) required
- Minimum 250 flight hours needed

Types of Flight Instructor Certifications:
1. Certified Flight Instructor (CFI) - instructs on single-engine aircraft
2. Multi-Engine Instructor (MEI) - instructs on multi-engine aircraft

There is no set timeframe for obtaining a flight instructor certificate. Training progresses through various ratings and milestones starting from initial flight training. The role allows instructors to gain valuable flight hours while teaching aspiring pilots and reinforcing their own training expertise.',
  'courses',
  'pilot_license',
  'text',
  'ready'
),
(
  'Airline Transport Pilot License (ATPL)',
  'What is the Airline Transport Pilot License program?',
  'The Airline Transport Pilot License (ATPL) is the highest level of aircraft pilot certification. Wind Chasers offers ATPL training as part of their comprehensive aviation education programs.

Eligibility Requirements:
- Minimum age: 21 years old
- Hold a Multi-Crew Pilot License (MPL) or Commercial Pilot License (CPL)
- Possess a Class 1 Medical Certificate
- Demonstrate English language proficiency (reading, speaking, writing, understanding)
- Pass ATPL theoretical knowledge exams

Flight Experience Requirements (Fixed-Wing):
- Total Aeronautical Experience: 1,500 hours
- Flight Time as Pilot: 1,400 hours
- Pilot in Command (PIC) or PICUS: 500 hours (or 250+ if ≥70 PIC)
- Cross-Country Flight Time: 200 hours
- Cross-Country as PIC/PICUS: 100 hours
- Night Flight Time (non-dual): 100 hours
- Instrument Flight Time: 45 hours

For Helicopter (ATPL-H): Total 1,000 hours, 900 as pilot, 250 PIC, 200 cross-country, 50 night, 50 instrument.

Up to 100 hours can be completed in Flight Simulation Training Devices (FSTD). Requires regular flight reviews and instrument proficiency checks (IPCs) to maintain active status.',
  'courses',
  'pilot_license',
  'text',
  'ready'
),
(
  'Night Rating Program',
  'What is the Night Rating program?',
  'The Night Rating course at Wind Chasers equips pilots with the necessary skills to safely navigate and operate aircraft during night conditions under visual flight rules (VFR).

Eligibility Requirements:
- Valid and current Private Pilot License (PPL)
- Valid and current Medical Class 1 Certificate
- English Language Proficiency certification
- Minimum 15 hours of flight training

Flight Training (15 hours total):
- 10 hours dual instruction (including 5 hours night training with 2 hours cross-country)
- 5 hours instrument training
- 5 hours solo night flight

Theoretical Knowledge: Minimum 5 hours instruction covering DGCA, CAA, and FAA materials

Instrument Instruction: Minimum 10 hours total (5 hours on approved Flight Simulation Training Device)

Night Operations: 5 takeoffs and 5 landings under night conditions, plus dual cross-country flight of at least 150 nautical miles.

Examinations include theory exams on air regulations and human performance, ground evaluation, unusual attitude and VOR interception assessment.',
  'courses',
  'specialized',
  'text',
  'ready'
),
(
  'Airbus A320 Type Rating',
  'What is the Airbus A320 Type Rating program?',
  'Wind Chasers offers a comprehensive A320 Type Rating program in collaboration with international training partners, designed for pilots pursuing professional airline operations.

Course Components:
1. Ground School Training - Systems, procedures, and safety protocols
2. Full Flight Simulator Training - Level D simulator practical sessions
3. MCC & JOC Courses - Multi-Crew Cooperation focusing on teamwork, communication, decision-making, plus Jet Orientation Course for jet aircraft operational preparation
4. Line-Oriented Flight Training & Base Training - Simulated air operations and live aircraft experience

Eligibility Requirements:
- Valid Commercial Pilot License (CPL) with Instrument Rating (IR)
- Class 1 Medical Certificate
- ICAO English Language Proficiency Level 4 minimum

Key Benefits: International certification recognized globally, career support for airline assessments and recruitment, training available at multiple international centers, integrated MCC and JOC modules with expert instruction, advanced simulator facilities.

To operate popular Airbus models like the A320 as a co-pilot or captain, Wind Chasers consultants guide students in attaining the Airbus A320 Type Rating certification.',
  'courses',
  'type_rating',
  'text',
  'ready'
),
(
  'Boeing 737 Type Rating',
  'What is the Boeing 737 Type Rating program?',
  'Wind Chasers offers specialized Boeing 737 Type Rating training for pilots seeking to operate this widely-used aircraft. Boeing 737 aircraft crisscross Indian skies daily on domestic as well as APAC circuits owing to their unmatched fuel economy and reliability.

Course Components:
1. Ground School Training - Comprehensive sessions on B737 systems, avionics, and emergency protocols
2. Full Flight Simulator (FFS) Training - Training on advanced B737 simulators simulating real-world operations
3. Multi-Crew Cooperation (MCC) - Master teamwork and operational coordination in multi-crew environments
4. Jet Orientation Course (JOC) - Focus on high-performance jet dynamics and automation skills
5. Line-Oriented Flight Training (LOFT) - Simulated airline operations to prepare for real-world challenges
6. Base Training - Live aircraft sessions to meet regulatory requirements

Eligibility Requirements:
- Valid Commercial Pilot License (CPL) with Instrument Rating (IR)
- Class 1 Medical Certificate
- Minimum ICAO Level 4 English language proficiency

Key Benefits: Internationally recognized certification, career mentorship support for interviews and assessments, multiple training centers with flexible scheduling, integrated MCC and JOC modules with expert instruction.',
  'courses',
  'type_rating',
  'text',
  'ready'
),
(
  'Helicopter Training (CHPL)',
  'What is the Helicopter Pilot Training program?',
  'Wind Chasers offers DGCA-approved Commercial Helicopter Pilot License (CHPL) training in India.

Program Duration & Hours:
- Total Duration: Approximately 1 year
- Ground Classes: 3-6 months
- Flying Training: 150 hours on designated helicopter aircraft

Eligibility Requirements:
- Completed Class 12 with Physics and Mathematics from a recognized board
- Minimum age: 17 years at admission
- Class 2 medical clearance before flight training begins
- Class 1 medical certification required for license issuance

Ground School Subjects:
- Air Navigation
- Aviation Meteorology
- Air Regulations
- Technical General (aircraft systems)
- Technical Specific (helicopter-focused systems)
- Radio Telephony

CHPL graduates are trained to navigate and operate helicopters safely across various weather and terrain conditions, communicate effectively with ATC, perform mandatory pre-flight inspections, and monitor onboard instruments.

Note: Flight training hours may vary based on DGCA guidelines and country-specific regulations.',
  'courses',
  'helicopter',
  'text',
  'ready'
),
(
  'Diploma in Aviation',
  'What is the Diploma in Aviation program?',
  'Wind Chasers offers a Diploma in Aviation program for Commercial Pilots with an innovative curriculum emphasizing practical flight training combined with theoretical instruction.

The program integrates intensive ground school sessions and immersive flight exercises.

Certifications Upon Completion:
- Private Pilot License
- Night Rating
- VFR Over The Top Rating
- Commercial Pilot License

Course Inclusions:
1. Private Pilot License
2. Commercial Pilot License
3. Multi-Engine Instrument Rating
4. Night Rating
5. Diploma in Aviation certification

Eligibility Requirements:
- Minimum age: 17 years
- Education: Class 10+2 completion with mathematics and physics
- English Proficiency: Canada and New Zealand require IELTS/PTE; South Africa has no specific English test requirement.',
  'courses',
  'diploma',
  'text',
  'ready'
),
(
  'Foreign CPL Conversion',
  'What is the Foreign CPL conversion program?',
  'Wind Chasers offers Foreign Commercial Pilot License (CPL) conversion services for pilots trained internationally who are seeking to obtain their Indian CPL certification.

Key Services Provided:
1. Documentation Assistance - Complete support in assembling and submitting required documentation, ensuring compliance with DGCA regulations
2. FTO Slot Allocation - Pre-booked slots with renowned Indian Flight Training Organizations (FTOs) to minimize waiting times
3. Ground Training - Tailored coaching for DGCA exams, designed to meet Indian aviation standards
4. Flight Training Support - Training with top-tier Indian FTOs to fulfill DGCA skill verification requirements
5. Comprehensive Guidance - From application to obtaining your Indian CPL, support at every step

Wind Chasers has extensive experience with CPL conversions and Indian aviation requirements, with reduced waiting periods through pre-booked FTO slots and personalized support throughout the conversion journey.',
  'courses',
  'conversion',
  'text',
  'ready'
),
(
  'Pre-Cadet Program',
  'What is the Pre-Cadet Program?',
  'The Pre-Cadet Program at Wind Chasers is designed to prepare aspiring pilots for competitive airline cadet selection processes through structured training and guidance.

Key Program Components:
1. Written Exam Preparation - Mathematics, physics, aviation knowledge, and logical reasoning training
2. Interview Readiness - Mock interviews and HR question training with personalized feedback
3. CASS Training - Psychomotor skills and situational awareness development with flight simulator practice sessions
4. Airline-Specific Guidance - Customized preparation tailored to individual airline requirements

Program Advantages:
- Learn from aviation professionals through expert guidance
- Comprehensive curriculum covering technical to interpersonal skills
- Personalized support designed to maximize your success',
  'courses',
  'preparation',
  'text',
  'ready'
),
(
  'Multi-Engine Instrument Rating (MEIR)',
  'What is the Multi-Engine Instrument Rating program?',
  'The Multi-Engine Instrument Rating (MEIR) program at Wind Chasers qualifies pilots to operate multi-engine aircraft under Instrument Flight Rules (IFR). It is a crucial step for airline careers.

Program Components:
1. Assessment Phase - Streamlined conversion for experienced pilots, personalized training plans for beginners
2. Instrument Rating Training - IFR navigation, emergency handling, advanced maneuvers
3. Multi-Engine Flight Training - Hands-on experience with state-of-the-art aircraft
4. DGCA-Compliant Curriculum - Aligned with Indian aviation standards

Key Features:
- Comprehensive training from basic to advanced multi-engine operations
- Seasoned instructors with extensive aviation experience
- Integrated, efficient training pathways',
  'courses',
  'instrument_rating',
  'text',
  'ready'
),
(
  'Airline Preparation Program',
  'What is the Airline Preparation Program?',
  'The Airline Preparation Program at Wind Chasers bridges the gap between earning a Commercial Pilot License (CPL) and securing an airline position.

Key Program Components:
1. Written Exam Coaching - Covers complex aviation topics including aerodynamics, navigation, and regulations
2. Group Discussion Skills - Real-world simulations emphasizing communication and collaboration
3. CASS Training - Multitasking and decision-making practice, situational awareness development through flight simulators
4. Interview Preparation - Mock interviews conducted by industry experts, behavioral and technical question coaching

Training Features:
- Tailored training customized to your strengths and needs
- Industry expertise aligned with airline expectations
- End-to-end support throughout the recruitment process',
  'courses',
  'preparation',
  'text',
  'ready'
),
(
  'Cabin Crew Program',
  'What is the Cabin Crew Program?',
  'Wind Chasers offers a cabin crew training program designed as a gateway to a high-flying career in the skies, emphasizing affordable, job-ready training with industry connections.

Training Highlights:
- Safety & Survival Training
- Customer Service Mastery
- Global Awareness instruction
- Professional Image Workshops
- Mock Flights with real-world scenarios

Eligibility Requirements:
- Minimum age: 18 years old
- Fluent English proficiency (additional languages preferred)
- Strong interpersonal and people skills
- Physical fitness for dynamic lifestyle demands
- Completed 10+2/12th grade education

Program Benefits:
- Affordable, high-quality training designed for rapid job readiness
- Expert-led curriculum with confidence-building mock interviews
- Direct airline connections and recruitment event access
- Job placement assistance linking graduates to major carriers
- Practical, hands-on learning approach

Graduates have secured roles with top airlines, excelling on luxury international routes and regional flights alike.',
  'courses',
  'cabin_crew',
  'text',
  'ready'
),

-- ============================================================================
-- 3. DGCA GROUND CLASSES
-- ============================================================================

(
  'DGCA Ground Classes',
  'What are the DGCA Ground Classes?',
  'Wind Chasers DGCA Ground Classes are meticulously designed to equip aspiring pilots with essential aviation knowledge and skills. Faculty includes CAA Certified professionals, ex-Air Force pilots, and top commercial pilots.

Six Core Subjects:
1. Air Navigation
2. Aviation Meteorology
3. Air Regulations
4. Technical General
5. Technical Specific
6. RTR (Radio Telephony Rating)

Teaching Approach:
- Low student-to-teacher ratio of 25:1 focusing on individualized attention
- Comprehensive curriculum adhering to DGCA regulatory standards
- Interactive learning with study materials and mock tests
- Multimedia presentations and visual aids
- Hands-on activities accommodating different learning styles

Student Support:
- Personalized learning plans based on individual strengths and weaknesses
- Regular assessments with constructive feedback
- Flexible, adaptive teaching strategies
- One-on-one guidance outside class hours
- Encouraging, supportive classroom environment',
  'courses',
  'dgca',
  'text',
  'ready'
),

-- ============================================================================
-- 4. INTERNATIONAL TRAINING LOCATIONS
-- ============================================================================

(
  'Pilot Training in USA',
  'What about pilot training in the USA through Wind Chasers?',
  'Wind Chasers offers pilot training in the USA with FAA certifications that are widely acknowledged worldwide.

Available Certifications: Private Pilot License, Commercial Pilot License, Flight Instructor ratings, MEIR, ATPL, Type ratings (Airbus A320, Boeing 737)

Exams Required:
- FAA Written Exam for the Commercial Pilot Certificate covering regulations, aerodynamics, and navigation
- FAA Practical Test (Checkride) with an FAA-designated pilot examiner

Partner Flight Schools in Florida with fleets including Piper Seneca, Cessna 172, Cessna 152, Tecnam P2008, and simulators. Programs offered: PPL, CPL, Flight Instructor, University Degree programs, and Integrated ATPL.

Why USA: Diverse flying conditions across the country, multicultural environment, advanced infrastructure and modern aircraft, robust healthcare facilities, high safety standards and quality living conditions for international students.',
  'locations',
  'usa',
  'text',
  'ready'
),
(
  'Pilot Training in Canada',
  'What about pilot training in Canada through Wind Chasers?',
  'Wind Chasers offers pilot training in Canada with globally recognized qualifications from Transport Canada.

Key Advantages:
- Canadian pilot licenses are internationally respected
- Varied climate provides exposure to a wide range of weather conditions
- Industry prioritizes safety with stringent regulations
- Efficient training allowing timely completion of certifications
- Canada allows students to take up part-time jobs

Flight Schools:
1. Gatineau - Fleet of 25 aircraft (Cessna 172, Piper Tomahawk, Symphony, Piper Navajo). Courses: PPL, CPL, Aviation Maintenance, Aerobatics
2. British Columbia - Fleet of 23 aircraft (Piper Seneca III, DCX MAX FTD). Courses: PPL, CPL, CPL+IFR, Flight Instructor, ATPL, Human Factors

Certification: Transport Canada written exam covering air law, navigation, meteorology. Flight test with designated pilot examiner.',
  'locations',
  'canada',
  'text',
  'ready'
),
(
  'Pilot Training in New Zealand',
  'What about pilot training in New Zealand through Wind Chasers?',
  'Wind Chasers offers pilot training in New Zealand with internationally recognized CAA certifications.

Flight Schools: Located in Omarau and Motueka with more coming soon.

Aircraft Fleet: Tecnam single/multi-engine, Cessna 172 (new generation with Garmin NXi), Cessna 152, Piper PA-44 Seminole, aerobatic aircraft.

Programs: Private Pilot License, Commercial Pilot License, Flight Instructor, Aerobatic Rating, and aviation diplomas.

Exams: CAA Written Exam covering air law, meteorology, navigation, aircraft technical knowledge. CPL Flight Test conducted by Civil Aviation Authority examiner.

Why New Zealand: Internationally recognized aviation authority, high-quality training institutions, diverse flying environments, English instruction, stringent safety standards, competitive costs, straightforward visa process, post-study work opportunities, low crime rate, stable political environment, and welcoming communities.',
  'locations',
  'new_zealand',
  'text',
  'ready'
),
(
  'Pilot Training in Australia',
  'What about pilot training in Australia through Wind Chasers?',
  'Wind Chasers offers pilot training in Australia with CASA (Civil Aviation Safety Authority) certifications.

Exams & Certification:
- CASA Written Exam covering aerodynamics, navigation, meteorology, and air law
- CPL Flight Test conducted by CASA-approved examiners

Why Australia:
- World-class education system with globally recognized universities
- Strong economy with part-time work opportunities
- Safe and welcoming environment for international students
- Multicultural society and English language instruction
- Australian pilot licenses are internationally recognized
- High-quality training with modern facilities and experienced instructors
- Diverse geography and weather for varied flying conditions
- Stringent safety regulations
- High quality of life in cities like Sydney and Melbourne
- Efficient public transportation and high-quality healthcare

Partner flight schools are being finalized (coming soon).',
  'locations',
  'australia',
  'text',
  'ready'
),
(
  'Pilot Training in South Africa',
  'What about pilot training in South Africa through Wind Chasers?',
  'Wind Chasers offers pilot training in South Africa at their Lanseria location flight school.

Training Courses Available:
- Private Pilot License (PPL)
- Commercial Pilot License (CPL)
- DGCA Commercial Pilot''s Licence (includes accommodation)
- Airline Transport Pilot License (ATPL)
- Instructor Rating
- Multi-Crew Co-Operation Course (MCC)
- ATR Rating (ATR 42/72)

Aircraft Fleet: Cessna 172, Piper Cherokee, Garmin G5 equipped Piper Cherokee

Exams: SA CAA Written Exams covering air law, navigation, meteorology, and aircraft technical systems. CPL Flight Test with South African Civil Aviation Authority examiner.

Key Advantages: Cost-effective training compared to other countries, internationally recognized licenses, diverse flying environments, English as instruction language, efficient course duration, favorable weather conditions.

Wind Chasers recommends choosing reputable flight schools with strong safety records.',
  'locations',
  'south_africa',
  'text',
  'ready'
),
(
  'Pilot Training in India',
  'What about pilot training in India through Wind Chasers?',
  'Wind Chasers offers comprehensive pilot training in India based in Bangalore.

Available Certifications: PPL, CPL, CFI, Night Rating, ATPL, MEIR, Airbus A320 Type Rating, Boeing 737 Type Rating, Diploma in Aviation, Pre-Cadet Program, Airline Preparation Program.

Why India:
- Cost-effective training with competitive costs
- Internationally recognized licenses allowing global aviation careers
- Diverse flying environments across varied geography
- Growing aviation industry with increasing employment opportunities
- Cultural exposure during studies
- English-medium instruction

DGCA Examinations: The Directorate General of Civil Aviation (DGCA) conducts written exams covering air regulations, navigation, meteorology, and aircraft technical aspects.

Wind Chasers is headquartered in Bangalore with DGCA Ground Classes and partnerships with Indian flight training organizations.',
  'locations',
  'india',
  'text',
  'ready'
),

-- ============================================================================
-- 5. FREQUENTLY ASKED QUESTIONS
-- ============================================================================

(
  'How to become a pilot?',
  'How do I become a pilot?',
  'To become a pilot, follow these steps:

1. Meet basic eligibility: Minimum age 17 (PPL) or 18 (CPL), completed 10+2 with physics and mathematics, obtain Class 2/Class 1 medical certificate.

2. DGCA Ground Classes: Study 6 core subjects - Air Navigation, Aviation Meteorology, Air Regulations, Technical General, Technical Specific, and Radio Telephony (RTR). Wind Chasers offers these with a 25:1 student-teacher ratio.

3. Private Pilot License (PPL): Minimum 50 hours flight training including 20 hours PIC.

4. Commercial Pilot License (CPL): 200 hours total flying including 100 hours PIC, 50 hours cross-country, 20 hours instrument time.

5. Additional ratings: Night Rating, Multi-Engine Instrument Rating (MEIR), and Type Ratings (A320 or B737) for airline careers.

6. Airline Preparation: Interview coaching, CASS training, and group discussion skills.

Wind Chasers supports you through every step with training in India and internationally (USA, Canada, New Zealand, Australia, South Africa).',
  'faq',
  'career_path',
  'text',
  'ready'
),
(
  'What are the eligibility requirements to become a pilot?',
  'What are the eligibility requirements to become a pilot?',
  'Eligibility requirements vary by license type:

Private Pilot License (PPL):
- Age: Minimum 17 years
- Education: 10th standard completion
- Medical: DGCA Class 2 Medical certificate

Commercial Pilot License (CPL):
- Age: Minimum 18 years
- Education: 10th grade + 2 years with physics and mathematics
- Medical: Class 1 Medical examination

Airline Transport Pilot License (ATPL):
- Age: Minimum 21 years
- Hold CPL or MPL
- Class 1 Medical Certificate
- English language proficiency
- Pass ATPL theory exams

Helicopter Training (CHPL):
- Age: Minimum 17 years
- Education: Class 12 with Physics and Mathematics
- Medical: Class 2 initially, Class 1 for license issuance

Cabin Crew:
- Age: Minimum 18 years
- Education: 10+2/12th grade
- Fluent English, physical fitness',
  'faq',
  'eligibility',
  'text',
  'ready'
),
(
  'What countries can I train in?',
  'In which countries can I do pilot training through Wind Chasers?',
  'Wind Chasers offers pilot training in 6 countries:

1. USA - FAA certifications, partner schools in Florida with Cessna and Piper fleets
2. Canada - Transport Canada certifications, schools in Gatineau and British Columbia
3. New Zealand - CAA certifications, schools in Omarau and Motueka
4. Australia - CASA certifications, partner schools coming soon
5. South Africa - SA CAA certifications, school at Lanseria with cost-effective training
6. India - DGCA certifications, based in Bangalore

Each location offers different advantages in terms of cost, weather conditions, visa processes, and career opportunities. Wind Chasers provides complete support including educational loans, enrollment, visa documentation, immigration, accommodation, and continuous guidance regardless of your chosen training location.',
  'faq',
  'locations',
  'text',
  'ready'
),
(
  'What programs does Wind Chasers offer?',
  'What programs does Wind Chasers offer?',
  'Wind Chasers offers the following programs:

Pilot Certifications:
- Private Pilot License (PPL)
- Commercial Pilot License (CPL)
- Certified Flight Instructor (CFI)
- Night Rating Program
- Airline Transport Pilot License (ATPL)
- Airbus A320 Type Rating
- Boeing 737 Type Rating
- Diploma in Aviation
- Foreign CPL Conversion
- Pre-Cadet Program
- Multi-Engine Instrument Rating (MEIR)
- Airline Preparation Program
- Helicopter Training (CHPL)
- Cabin Crew Program

Ground Training:
- DGCA Ground Classes (6 subjects)

Support Services:
- Educational Loan Support
- Visa Documentation
- Immigration Support
- Accommodation Support
- Enrollment Support
- Continuous Student Guidance

Training is available in India, USA, Canada, New Zealand, Australia, and South Africa.',
  'faq',
  'programs',
  'text',
  'ready'
),
(
  'What is the difference between PPL and CPL?',
  'What is the difference between PPL and CPL?',
  'The key differences between Private Pilot License (PPL) and Commercial Pilot License (CPL):

PPL (Private Pilot License):
- Minimum age: 17 years
- Education: 10th standard
- Flight hours: 50 hours minimum (20 PIC)
- Medical: Class 2
- Purpose: Fly for personal/recreational use, cannot be paid to fly
- First step in pilot training

CPL (Commercial Pilot License):
- Minimum age: 18 years
- Education: 10+2 with physics and mathematics
- Flight hours: 200 hours (100 PIC, 50 cross-country, 20 instrument)
- Medical: Class 1
- Purpose: Fly professionally for airlines and commercial operations
- Requires PPL as prerequisite
- Additional check rides: night flying, cross-country (250nm day, 120nm night), instrument rating

The CPL is required if you want to pursue a career as a professional pilot with airlines.',
  'faq',
  'comparison',
  'text',
  'ready'
),
(
  'What is a type rating?',
  'What is a type rating and why do I need one?',
  'A type rating is a certification that authorizes a pilot to operate a specific aircraft type. Airlines require pilots to have the appropriate type rating for the aircraft they will fly.

Wind Chasers offers two type ratings:

Airbus A320 Type Rating:
- Required to operate A320 family aircraft as co-pilot or captain
- Components: Ground school, Level D simulator training, MCC & JOC courses, line-oriented flight training, base training
- Prerequisites: Valid CPL with IR, Class 1 Medical, ICAO English Level 4

Boeing 737 Type Rating:
- Required to operate B737 aircraft which crisscross Indian skies daily
- Components: Ground school on B737 systems/avionics/emergency, FFS training, MCC, JOC, LOFT, base training
- Prerequisites: Valid CPL with IR, Class 1 Medical, ICAO English Level 4

Both certifications are internationally recognized and include career mentorship support for airline interviews and assessments.',
  'faq',
  'type_rating',
  'text',
  'ready'
),
(
  'What is DGCA?',
  'What is DGCA and why are DGCA exams important?',
  'DGCA stands for Directorate General of Civil Aviation. It is the Indian government regulatory body for civil aviation. DGCA exams are mandatory written examinations that all pilot candidates must pass to obtain their Indian pilot licenses.

DGCA Ground Class Subjects:
1. Air Navigation - navigation techniques and procedures
2. Aviation Meteorology - weather systems and their impact on aviation
3. Air Regulations - aviation laws and rules
4. Technical General - aircraft systems knowledge
5. Technical Specific - specific aircraft type technical knowledge
6. RTR (Radio Telephony Rating) - radio communication procedures

Wind Chasers DGCA Ground Classes feature:
- CAA Certified professionals, ex-Air Force pilots, and top commercial pilots as faculty
- 25:1 student-to-teacher ratio
- Interactive learning with mock tests
- Personalized learning plans
- One-on-one guidance outside class hours

Passing DGCA exams is required for PPL, CPL, and all higher pilot certifications in India.',
  'faq',
  'dgca',
  'text',
  'ready'
);

-- ============================================================================
-- 6. BACKFILL: Insert all Q&A entries into knowledge_base_chunks for search
-- ============================================================================

INSERT INTO knowledge_base_chunks (knowledge_base_id, chunk_index, content)
SELECT
  kb.id,
  0,
  COALESCE(kb.question, '') || E'\n\n' || COALESCE(kb.answer, kb.content, '')
FROM knowledge_base kb
WHERE kb.embeddings_status = 'ready'
  AND NOT EXISTS (
    SELECT 1 FROM knowledge_base_chunks c WHERE c.knowledge_base_id = kb.id
  );

COMMIT;
