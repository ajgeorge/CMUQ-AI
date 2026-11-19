# Editing the content

Everything the simulator knows about clients and products lives in this folder. You can change
it without touching any code: edit the JSON files and restart the server.

```
content/
  products.json              the bank's product catalogue
  clients/
    ahmed/
      profile.json           who the client is
      hidden-needs.json      what the student has to uncover, and which products suit them
    maria/ ...
    noura/ ...
```

When the server starts it checks every file. If something is wrong, it stops and tells you the
file and field to fix, for example:

```
clients/maria/hidden-needs.json → needs[1].revealWhen: must not be empty
```

## Adding a new client

1. Copy an existing client folder (e.g. `clients/maria`) and rename it. The folder name becomes
   the client's id, so use lowercase letters, numbers and dashes only (e.g. `khalid`).
2. Edit `profile.json` and `hidden-needs.json` (see below).
3. Restart the server. The new client appears on the selection screen.

## profile.json

| Field         | Shown to student? | What it is                                                                                                                                                |
| ------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | Yes               | Full name                                                                                                                                                 |
| `age`         | Yes               | Age in years                                                                                                                                              |
| `occupation`  | Yes               | Job or business                                                                                                                                           |
| `location`    | Yes               | Where they live                                                                                                                                           |
| `difficulty`  | Yes               | `beginner`, `intermediate` or `advanced`. Also sets how open the client is: beginners hint, advanced clients only answer specific questions               |
| `summary`     | Yes               | One or two sentences the student reads before the interview. The client also uses it to answer general questions like "How can I help?", so keep it vague |
| `openingLine` | Yes               | The first thing the client says. Keep it vague: no hidden needs here.                                                                                     |
| `personality` | No (AI only)      | How the client talks and behaves                                                                                                                          |
| `background`  | No (AI only)      | Facts the AI can use to answer questions realistically                                                                                                    |

## hidden-needs.json

This file is never sent to the student's browser.

**`needs`**: the things the student should discover. Each need has:

| Field              | What it is                                                                 |
| ------------------ | -------------------------------------------------------------------------- |
| `id`               | Short name, lowercase with dashes (e.g. `cash-flow-gap`)                   |
| `title`            | A few words naming the need, shown to the student after the interview      |
| `importance`       | `critical`, `medium` or `low`                                              |
| `description`      | The full facts of the need                                                 |
| `revealWhen`       | What kind of question makes the client reveal it                           |
| `exampleQuestions` | Good questions that would uncover it (the coach uses these as suggestions) |

**`productFit`**: the answer key the coach uses. List products under `suitable`, `acceptable` or
`unsuitable`, each with a `productId` from `products.json` and a `reason`. A product can only
appear in one list. Products not listed are treated as not relevant to this client.

## products.json

`bank` holds the bank's name and currency. Each product in `products` has:

| Field             | What it is                                              |
| ----------------- | ------------------------------------------------------- |
| `id`              | Short name, lowercase with dashes; used in `productFit` |
| `name`            | Display name                                            |
| `category`        | `business` or `personal`                                |
| `type`            | `account`, `financing`, `savings` or `investment`       |
| `shariaCompliant` | `true` or `false`                                       |
| `summary`         | One sentence                                            |
| `features`        | List of main features                                   |
| `limitations`     | List of limitations                                     |
| `eligibility`     | List of who can apply                                   |
| `fees`            | Short description of the fees                           |

All banks, people and products here are fictional.
