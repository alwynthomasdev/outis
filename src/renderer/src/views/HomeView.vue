<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const actions = [
  {
    to: '/data',
    title: 'Anonymise a file',
    text: 'CSV or JSON. Outis suggests what to replace in each column or property, and you choose.'
  },
  {
    to: '/text',
    title: 'Anonymise text',
    text: 'Paste or open text. Rules and a local ML model find names, emails, phone numbers and more.'
  },
  {
    to: '/library',
    title: 'Edit PII library',
    text: 'The names, places, domains and phone numbers used for fakes, plus your own detectors.'
  }
]
</script>

<template>
  <div class="page home">
    <h1 class="page-title">Outis</h1>
    <p class="page-sub">Remove personal data from files and text. Runs completely offline.</p>
    <div class="cards">
      <button v-for="a in actions" :key="a.to" class="card" @click="router.push(a.to)">
        <span class="card-title">{{ a.title }} →</span>
        <span class="card-text">{{ a.text }}</span>
      </button>
    </div>
    <div class="how">
      <h3>How it works</h3>
      <ol>
        <li><b>Open</b> a file or paste text.</li>
        <li><b>Review</b> what Outis found. Change anything you like.</li>
        <li><b>Compare</b> the original and the anonymised version side by side.</li>
        <li><b>Export</b> the anonymised copy. The original file is never changed.</li>
      </ol>
      <p class="muted">
        Replacements are consistent: the same name always becomes the same fake name, and its email
        address follows it, so the data stays useful for testing and analysis.
      </p>
    </div>
  </div>
</template>

<style scoped>
.home {
  max-width: 980px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin: 8px 0 28px;
}
.card {
  all: unset;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 22px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  transition:
    border-color 0.15s,
    transform 0.15s;
}
.card:hover,
.card:focus-visible {
  border-color: var(--accent);
  transform: translateY(-1px);
}
.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--accent);
}
.card-text {
  color: var(--muted);
  line-height: 1.45;
}
.how {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 4px 22px 14px;
}
.how li {
  margin: 6px 0;
}
</style>
