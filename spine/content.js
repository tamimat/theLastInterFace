// content.js — the canonical spine + skeleton content.
// Edit this file to update the spine. Both index.html and section.html read from here.
//
// Field meanings:
//   teaser   — the schematic line or core sentence; shown on the index next to the title.
//              Keep this short and evocative (one line). It's the bird's-eye preview.
//   spine    — the dense, load-bearing treatment of the section. Multi-paragraph prose.
//              Use \n\n between paragraphs. This is what a fresh chat needs to write or
//              reason about this section correctly.
//   skeleton — supporting material: anchor thinkers, objections to address, voice notes,
//              alternative framings considered, cross-section connections, open questions.
//
// Boundary rule (the test):
//   For each paragraph, ask: "would a chat seeded with everything except this paragraph
//   still write the right section?" If yes, it belongs in the skeleton. If no, in the spine.
//
// Paragraphs are promotable/demotable between spine and skeleton. They're not permanently
// assigned. Err toward spine while drafting — easier to demote later than to discover a
// chat wrote the wrong section because something load-bearing was buried in skeleton.
//
// Lock workflow:
//   - status: "working" means this file is being iterated on. Filename stays spine/content.js.
//   - To lock a version: bump meta.version, set status to "locked", set lockedDate to ISO date,
//     then save a frozen copy at /artifacts/spine-v{version}.html (rendered) and commit.

window.SPINE = {
  meta: {
    version: "0.0",
    status: "working",
    lockedDate: null,
    title: "The Last Interface"
  },

  opening: "[Where the reader lands on page one. One or two sentences. The image, scene, or claim that opens the book.]",

  thesis: "[The one-sentence argument of the book. What it claims and why it matters.]",

  ending: "[Where the reader lands when they close the book. One or two sentences. The line that earns the title.]",

  sections: [
    {
      n: 1,
      title: "The central proposition",
      teaser: "Sense → make meaning → tell, because we need to connect → the other receives → we see their reaction → connection.",
      spine:
        "Sense → make meaning → tell, because we need to connect → the other receives → we see their reaction → connection.\n\n" +
        "We are meaning-transmitting machines.\n\n" +
        "We sense. We make meaning of what we have sensed. And then, because the meaning is too much to hold alone, we reach toward another human — to tell, to be received, to see the meaning land in someone else, and to be changed in return.\n\n" +
        "The word machines is provocative on purpose. Not in the way computers are machines. Not in the way networks are machines. We are the kind of machine that turns sensing into meaning, meaning into story, story into connection across time.\n\n" +
        "Other living beings sense. Some feel. Some communicate. Only humans complete the full chain — meaning made, told, received, retold across generations. This is the long unbroken conversation that is being human.\n\n" +
        "The carrying image. A grandmother telling her grandchild what she learned in a long life is the chain in a single moment. She sensed. She made meaning. She is telling because she needs the child to know, and because she needs to see the child receive it. The child is receiving. One day the child will tell too — not only to pass it on, but because they too will need to be received.\n\n" +
        "Why this matters for the rest of the book. We have to begin with what we are because the interface between human and machine cannot be designed well until both sides are understood. Seventy years on the machine side. Barely begun on the human side. Most interface design has treated humans as users, attention, data, behavior to be steered. None of these are what we are.\n\n" +
        "If we are meaning-transmitting machines — sensors who make meaning and must reach toward each other to connect — then the interface must be built to honor that, not displace it. This is the throughline of the entire book. Every chapter must advance or complicate it.",
      skeleton: "[Supporting material for section 1: anchor thinkers you draw on or push against, objections to address, voice notes, alternative carrying images you considered, where this collides with current tech narratives, cross-section connections.]"
    },
    {
      n: 2,
      title: "[Section 2 title]",
      teaser: "[Schematic line or core sentence — one line.]",
      spine: "[Dense multi-paragraph treatment. Use \\n\\n between paragraphs.]",
      skeleton: "[Supporting material.]"
    },
    {
      n: 3,
      title: "[Section 3 title]",
      teaser: "[Schematic line or core sentence — one line.]",
      spine: "[Dense multi-paragraph treatment.]",
      skeleton: "[Supporting material.]"
    },
    {
      n: 4,
      title: "[Section 4 title]",
      teaser: "[Schematic line or core sentence — one line.]",
      spine: "[Dense multi-paragraph treatment.]",
      skeleton: "[Supporting material.]"
    },
    {
      n: 5,
      title: "[Section 5 title]",
      teaser: "[Schematic line or core sentence — one line.]",
      spine: "[Dense multi-paragraph treatment.]",
      skeleton: "[Supporting material.]"
    }
  ]
};
