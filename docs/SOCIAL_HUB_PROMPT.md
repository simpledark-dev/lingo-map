You are helping me implement the first playable prototype of my cozy social hub language-learning game.

Important context:
We already have an existing game project with:

- A tile-based map using 16x16 tiles
- Player movement already implemented
- For now, the map can be mostly empty floor tiles (make the dimension 28 x 20)
- Objects/decorations can be added later

The goal of this first version is NOT voice/speaking yet.
For now, the game is fully text-based:

- NPC says a line
- Player chooses from 2-3 sentence options (the options appear only when NPC finishes the line)
- Based on the chosen option, the dialogue branches
- Successful/happy-path outcomes give +$1 tip
- NPC stays in the game and continues wandering if their “life/session” is not finished
- Bad choices may either:
  - make NPC respond angrily and leave (in the case the dialogue tree ends there)
  - or continue the dialogue and give the player a chance to recover (if the dialogue tree doesn't end there)

Core game fantasy:
The player runs a cozy social hub/lounge.
NPCs enter, get welcomed, wander to points of interest, make requests, have small talk, ask for help, and eventually leave a review.

Build the first scaffold/prototype of this system.

High-level gameplay loop:

1. New NPCs spawn at the entrance area.
2. All new NPCs must first appear at the entrance.
3. Entrance interaction must always be about entering/welcoming/checking if the place is open.
4. Player taps/interacts with NPC marker.
5. Dialogue UI opens.
6. Player chooses one of 2-3 sentence responses.
7. Dialogue resolves based on the selected option.
8. If successful, player gets +$1 tip.
9. NPC then picks a valid point of interest and walks/wanders there.
10. NPC can later trigger another context-appropriate interaction.
11. NPC eventually leaves after its life/session ends.
12. When leaving, NPC may leave a simple review based on satisfaction.

Important design rule:
Each point of interest can only allow certain interaction/request types that make sense there.

Examples:

- Entrance:
  - welcoming
  - asking if the place is open
  - asking if they can come in
- Reading/book area:
  - ask for book recommendation
  - ask for quiet area
  - casual talk
  - request coffee/snack is allowed
  - should NOT ask weird unrelated things like “can I swim here?”
- Lounge/seating area:
  - casual talk
  - ask for drink
  - ask for charger
  - ask for blanket
  - complain about temperature
- Game/activity area:
  - ask to play
  - ask about rules
  - ask for score
  - casual competition talk
- Staff/service area:
  - staff-related tasks
  - drink/food preparation
  - maintenance help

For this first prototype, create several point of interest definitions even if the map visually only has floor tiles. Use invisible/placeholder POI coordinates for now.

NPC movement and occupancy:

- Define points of interest with coordinates.
- NPCs should be able to navigate/wander to available POIs.
- Do not allow multiple NPCs to occupy the exact same POI slot.
- Entrance is special:
  - It can have multiple entrance slots next to each other.
  - Max 5 entrance slots.
  - NPCs can queue/spawn there without overlapping.
- Add a maximum number of NPCs on the map at once, configurable, e.g. MAX_NPCS = 8.
- If all valid POIs are occupied, NPC should either wait, idle, or choose another valid available POI.
- Keep this simple for now.

NPC lifecycle:
Each NPC should have:

- id
- name
- type/personality
- current position
- current state:
  - entering
  - waiting_for_welcome
  - wandering
  - waiting_for_interaction
  - in_dialogue
  - leaving
- satisfaction score
- number of successful interactions
- number of failed interactions
- remaining interaction count or lifetime timer
- current POI
- current interaction

Interaction system:
Build interactions as reusable dialogue trees.

Each interaction should have:

- id
- allowedPoiTypes
- starter line variations
- weighted probability if possible
- dialogue nodes
- player response options
- each option can:
  - go to another dialogue node
  - complete successfully
  - fail
  - make NPC leave
  - change satisfaction
  - give tip
  - trigger staff task later

Example interaction: entrance_welcome

NPC starter variations:

- “Hi, is this place still open?”
- “Hey there, can I come in?”
- “Hello, are you still accepting visitors?”

Player options:

1. “Yes, we’re still open. Please come in.”
   - happy path
   - NPC responds positively
   - +$1 tip
   - NPC moves to another POI
2. “No, we’re closed.”
   - NPC disappointed
   - maybe leaves
3. “Get out.”
   - NPC angry
   - NPC leaves
   - satisfaction decreases

Example interaction: ask_for_drink

NPC:
“Can I have something to drink, please?”

Player options:

1. “Of course. What would you like?”
   - continues dialogue
2. “Sorry, we don’t have drinks right now.”
   - neutral/bad
3. “No, go away.”
   - angry, maybe leaves

Next node:
NPC:
“I’d like a coffee please.”

Player options:

1. “Sure, I’ll ask the staff.”
   - success or staff task
2. “Actually, never mind.”
   - bad/confusing

Staff task support:
Not sure if this should be fully implemented now or just scaffolded, but please design the code so staff tasks can be added easily.

For the first prototype, you can either:
Option A:

- Implement a simple staff task flow:
  customer asks for coffee
  marker appears above staff
  player talks to staff
  staff confirms
  marker appears back above customer
  player returns item
  request completes
  Option B:
- If too much for first pass, create the data model and TODO hooks for staff task flow, but implement direct completion for now.

Please choose the simplest good approach, but keep the architecture extendable.

Dialogue variations:
Important:
Each interaction/request should support multiple variations so repeated requests feel different.

Example:
Interaction: ask_ownership_duration

NPC starters:

- “How long have you owned this place?”
- “Have you been running this hub for a long time?”
- “So, when did you start this place?”

Player picks:

- “It’s been 2 years.”
- “Only recently actually.”
- “My family used to run it before me.”

If player picks “It’s been 2 years,” NPC response can vary:

- “Wow, 2 years already? That’s impressive.”
- “Oh, only 2 years? Still, that’s a good start.”
- “Nice. You must have learned a lot.”

Different NPC responses can lead to different follow-up player options.
Basically this is a dialogue tree with variations and weighted branching.

For the first version:

- Hardcode maybe 5-8 interaction types.
- Each interaction should have at least 2 starter variations.
- Each dialogue node should have 2-3 player response options.
- Add at least one bad/rude option so we can test negative outcomes.
- Add at least one interaction with a second dialogue step.
- Add at least one interaction that makes NPC leave immediately on bad response.
- Add at least one interaction that gives the user a chance to recover after a bad response.

Suggested first interactions:

1. entrance_welcome
2. ask_for_drink
3. ask_for_charger
4. complain_about_heat
5. casual_how_long_owned
6. ask_for_blanket
7. ask_book_recommendation
8. ask_wifi

UI:

- Show marker above NPCs that currently need interaction.
- Player can interact with NPC when close enough or by tapping/clicking marker.
- Dialogue panel shows:
  - NPC name
  - NPC line
  - 2-3 player response buttons
- When player selects response:
  - show NPC response
  - apply outcome
  - show money/tip popup if earned
  - close dialogue or continue to next node
- Show current money somewhere on screen.
- Optional: show simple satisfaction/review log.

Reviews:
For now, when NPC leaves, generate simple review text based on satisfaction:

- High satisfaction:
  - “Friendly staff and cozy atmosphere.”
  - “I felt very welcome here.”
- Neutral:
  - “It was okay.”
- Low:
  - “The owner was rude.”
  - “I didn’t feel welcome.”

Technical requirements:

- Keep code clean and modular.
- Avoid putting all logic inside one huge component.
- Create clear modules/types for:
  - NPC model/state
  - POI definitions
  - interaction/dialogue tree definitions
  - dialogue engine
  - NPC spawning/lifecycle
  - NPC movement/occupancy
  - rewards/reviews
- Make the system data-driven as much as possible.
- Dialogue content should live in data/config files, not be hardcoded inside UI components.
- Keep first implementation simple but extensible.

Important edge cases to handle:

- Max NPC count reached: do not spawn more.
- Entrance slots full: delay spawning.
- No available POI: NPC waits/idles.
- NPC already in dialogue: do not move them.
- Player starts dialogue: pause that NPC’s wandering.
- NPC leaving: free its occupied POI slot.
- Interaction completed: clear current interaction.
- Bad response causing leave: remove NPC after short delay.
- Multiple NPC markers: player can choose which NPC to talk to.
- Prevent two NPCs from selecting the same non-entrance POI.
- If an NPC is waiting for welcome at entrance, it should not wander yet.
- New NPCs must always complete entrance interaction first before going elsewhere.

Things to think through and implement if reasonable:

- NPC personality can influence which dialogue variation they pick.
- Weighted interaction selection based on POI type.
- Cooldown so the same NPC does not immediately ask another request.
- Avoid repeating the exact same interaction too frequently globally.
- NPCs should not all leave at the same time.
- NPCs should have simple idle/wander behavior.
- Some interactions should be one-step, some multi-step.
- Some successful interactions should only give tip once.
- Review should consider all interactions during that NPC visit.

First version acceptance criteria:

- I can run the game and see NPCs spawn at entrance.
- NPCs have markers when they need interaction.
- I can click/tap an NPC and choose dialogue options.
- Good options give +$1 tip.
- Bad options can reduce satisfaction or make NPC leave.
- After welcome, NPCs move to POIs.
- NPCs do not overlap on non-entrance POIs.
- NPCs can trigger context-appropriate interactions at POIs.
- NPCs eventually leave and generate simple review.
- The system is ready to later add speaking/shadowing mode.
