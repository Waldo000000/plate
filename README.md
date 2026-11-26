# Plate

I was trying to get leaner without losing muscle. By dinner, I couldn’t tell if I’d had enough protein or whether I was on track for a calorie deficit. And I wasn’t going to look up every ingredient and enter it by hand.

So I built Plate. I can take a photo or say what I ate, get an estimate from ChatGPT, and save it to my log. It was so seamless that I actually kept doing it. Within a few days I was making different choices.

These screenshots use fictional data.

## Before dinner

I check how much protein I still need and how much room I have left. The dotted section shows the energy I’m setting aside for protein. That helps me decide what else to have with dinner.

![The daily card, with energy set aside for the protein target](docs/images/before.jpg)

## After a day over budget

I tap an energy amount in the Food log to put the highest-energy items first. The rib fillet is at the top in this example. I think of steak as protein, but the blue part of the bar shows that just over half its energy came from fat.

![Food log sorted from highest to lowest energy, with a large blue fat segment on the rib fillet](docs/images/day.jpg)

## From bulk to cut

I wanted to put on muscle without putting on weight too fast. I raised my energy target, then gave it a few weeks. Looking at what I’d eaten next to my weight, I could see I was eating enough to move towards 90 kg.

![End of the bulk: weight reaches 90 kg alongside daily intake and the higher energy target](docs/images/track-bulk.jpg)

When I reached 90 kg, I switched to a cut by lowering my daily energy target. A few weeks later, my weight was coming down. A couple of big days stuck out, but getting back to my usual meals kept me moving towards my goal.

![A few weeks into the cut: the daily energy target steps down and weight starts coming down](docs/images/track-cut.jpg)

Looking at my track record against my targets, I could see that protein was mostly green but fibre was still yellow.

![Energy, protein and fibre targets early in the cut, with fibre tiles still yellow](docs/images/fibre-before.jpg)

I went back through a few days in my food log and tapped Fibre to see which foods had given me the most.

![Fibre breakdown for one day, with a pear at the top](docs/images/fibre-pear.jpg)

Pears were up there, so I started having them more often. The fibre tiles started turning green.

![Energy, protein and fibre targets later in the same cut, with fibre tiles now turning green](docs/images/targets.jpg)

I thought tracking calories would be a pain, but logging a meal takes next to no effort, and seeing those small changes pay off makes me want to keep doing it.

## Try it yourself

If you have [ChatGPT Sites](https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites), open ChatGPT Work on the web or desktop and paste this:

> Build a private ChatGPT Site from https://github.com/Waldo000000/plate. Run `node demo/build.mjs` and use the generated `demo/dist/index.html` as the Site’s static homepage. Use the existing demo, not a recreation or the live backend. Let me preview it before deploying.

**Run it locally instead:** Clone or download this repo. With Node.js 24 or newer, run `npm run demo` and open the address it prints. No dependencies to install.

Both routes use fictional meals and weights, and diary edits reset on reload. Add `?onboarding=1` to try the first-meal flow. This is a demo, not a personal log that saves your data.

The interface is plain HTML, CSS and JavaScript, with SVG for the charts. The live app uses a Worker and keeps each account’s log in D1. This repo has the app, tests and sample data, but no live logs or production configuration. For more, see [the design notes](docs/design.md).

### In-app logger source

The hosted app’s **+** composer accepts text, browser dictation or a photo. The
server uses the OpenAI Responses API for estimates. A standalone weigh-in
such as `84.8 kg` is saved without an API estimate. The fictional demo still
runs offline and does not use an API key.

The server build expects verified ChatGPT Sites identity headers and a D1
binding named `DB`. Do not expose this Worker behind a gateway that lets
clients supply those headers. Apply the migrations under `drizzle/`. Set
`PLATE_OWNER_SHA256` to the SHA-256 hex digest of the owner's verified
site-scoped user ID, and `PLATE_ORIGIN` to the canonical site origin. To enable
estimates, set `PLATE_ESTIMATE_ENABLED=true`, a valid `PLATE_ESTIMATE_END_UTC`,
and an `OPENAI_API_KEY` hosting secret. Never put that key in source or client
configuration. Settings → Manage accounts is owner-only.
