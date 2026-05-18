Game vision / context summary:

This is a cozy social-life/language-learning RPG centered around conversations, helping people, and managing a lively social hub/community lounge.

The core fantasy is NOT:

- coffee shop tycoon
- restaurant simulator
- flashcard learning app
- AI chatbot tech demo

The core fantasy IS:

- talking to people
- helping people
- handling social situations
- building a warm lively place where NPCs gather
- learning language through meaningful social interactions

The player runs a social hub/lounge/community place where:

- travelers
- students
- workers
- tourists
- locals
- random visitors

come in to relax, socialize, ask for help, play activities, and spend time.

The hub can contain different areas/points of interest such as:

- entrance/reception
- seating/lounge area
- reading/book area
- coffee/snack area
- activity/game area
- sports area
- event area
- outdoor terrace
- etc.

Each point of interest only allows interactions that logically make sense in that context.

Example:

- entrance interactions:
  - “is this place still open?”
  - “can i come in?”
- reading area:
  - book-related requests
  - casual conversations
  - coffee/snack requests
- lounge area:
  - small talk
  - charger requests
  - wifi requests
  - blanket requests
- sports/activity area:
  - competition talk
  - game requests
  - asking for rules
    etc.

The game should feel:

- cozy
- social
- lively
- reactive
- humorous sometimes
- emotionally warm

NPCs:

- spawn at entrance first
- must complete entrance/welcome interaction before entering the hub
- then wander around the hub
- can later trigger more interactions
- eventually leave and leave reviews
- continue existing in the world after interactions instead of disappearing immediately

NPCs should feel persistent/alive:

- wander to different POIs
- idle
- sit
- move around
- possibly revisit later
- occasionally re-engage with player

Conversation system philosophy:
The game is NOT about memorizing vocabulary directly.
The game teaches language through:

- social interactions
- requests
- helping people
- small talk
- emotional conversations
- environmental situations

Examples:

- customer asks for charger
- someone complains about heat
- someone asks for directions
- someone asks about hobbies
- someone asks about childhood dreams
- someone wants a drink
- someone asks for wifi password
  etc.

The language learning should feel contextual and meaningful instead of educational.

Important realization:
The strongest version of the game is probably NOT full AI/free conversation everywhere.

Instead:

- handcrafted dialogue trees
- dialogue variations
- branching outcomes
- weighted randomness
- emotional reactions
- contextual interactions

This creates the illusion of alive conversations while remaining scalable and controllable.

Conversation structure:
Interactions are dialogue trees with:

- multiple starter variations
- multiple NPC response variations
- multiple player response choices
- branching outcomes
- emotional consequences
- happy paths
- bad/rude paths
- recovery opportunities

Example:
NPC:
“How long have you owned this place?”

Player:
“It’s been 2 years.”

NPC possible reactions:

- “Wow, 2 years already?”
- “Oh, only 2 years?”
- “That’s impressive honestly.”

Each branch can continue differently.

Weighted probability should be used so:

- common dialogue appears more often
- rare dialogue occasionally appears
- conversations feel less repetitive

Replayability and variation are important.

Social consequences are a major gameplay pillar.
Player choices should have outcomes:

- good responses
- rude responses
- awkward responses
- funny responses
- confusing responses

Examples:
NPC:
“Is this place still open?”

Player:
“No.”

NPC leaves disappointed.

Or:
Player:
“Get out.”

NPC angry -> leaves bad review.

This is important because it makes conversations feel like gameplay rather than exercises.

The game should support:

- funny moments
- awkward moments
- emotional moments
- positive reinforcement
- negative outcomes

Rewards:
Currently the simplest reward system is:

- successful/helpful/warm interactions give tips
- for now hardcode something simple like +$1

Tips are used because:

- easy to understand
- fits the setting naturally
- rewards social success
- rewards helping behavior
- rewards enjoyable conversations

NPCs can also leave reviews when leaving the hub:

- positive
- neutral
- negative

The hub should gradually feel more lively and successful over time.

One important design insight:
Not every interaction should be transactional/service-oriented.

There are 3 major categories of interactions:

1. Practical/help requests
2. Casual/social small talk
3. Emotional/open-ended conversations

Examples of open-ended conversations:

- “What was your dream as a child?”
- “What’s your favorite hobby?”
- “How did you discover your hobby?”
- “What kind of person do you want to become?”

These encourage:

- longer responses
- storytelling
- emotional expression
- sentence-level speaking

This is important because one-word answers like:

- yes
- no
- okay

should not dominate the gameplay.

Initially we considered free-form speech + AI/LLM understanding.
But for v1 we decided:

- NO speaking yet
- NO free-form input yet
- player chooses from 2-3 sentence options

This is effectively a guided/shadowing-ready system.

The eventual long-term idea:

- player may later SPEAK the selected sentence aloud
- but current version is text-only

This keeps:

- implementation manageable
- dialogue quality controllable
- progression structured
- content scalable

Speaking/AI can be layered later.

Important implementation philosophy:
This should feel like:

- a systemic social conversation engine
  NOT:
- a chatbot
- a visual novel
- a quiz app

NPC interactions should emerge from:

- location
- personality
- dialogue variations
- branching trees
- weighted randomness
- player decisions
- environmental context

Another important mechanic:
Some interactions may require delegating to staff NPCs.

Example:
customer asks for coffee
↓
player talks to bartender NPC
↓
bartender prepares coffee
↓
player returns to customer
↓
customer happy

This creates:

- movement
- coordination
- workplace communication
- more natural language use
- multi-step gameplay

The overall target feeling:
A cozy living social hub where:

- conversations matter
- NPCs feel alive
- choices have consequences
- language is used meaningfully
- the player slowly builds a warm successful community place.
