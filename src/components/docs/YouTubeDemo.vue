<script setup lang="ts">
import { computed } from 'vue'
import { projectReadiness, youtubeEmbedUrl } from '../../content/project'

const props = withDefaults(defineProps<{ url: string; title?: string }>(), {
  title: 'ClearDose narrated WebMCP demonstration',
})
const embedUrl = computed(() => youtubeEmbedUrl(props.url))
</script>

<template>
  <div class="youtube-demo" data-testid="youtube-demo">
    <div v-if="embedUrl" class="youtube-demo__frame">
      <iframe
        :src="embedUrl"
        :title="title"
        loading="lazy"
        allow="fullscreen; picture-in-picture"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      />
    </div>
    <div v-else data-testid="youtube-placeholder">
      <div class="youtube-demo__frame youtube-demo__placeholder">
        <span class="youtube-demo__play" aria-hidden="true">▶</span>
        <h3>Public demo video pending</h3>
      </div>
      <div class="youtube-demo__caption">
        <p>A public YouTube demo under three minutes, with narration, will appear here.</p>
        <code>{{ projectReadiness.placeholders.youtube }}</code>
        <p class="youtube-demo__note">The recording script below is ready. It is not a published video.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.youtube-demo { width: 100%; overflow: hidden; border: 1px solid var(--cd-border); border-radius: var(--cd-radius-lg); background: var(--cd-navy); }
.youtube-demo__frame { width: 100%; aspect-ratio: 16 / 9; }
iframe { display: block; width: 100%; height: 100%; border: 0; }
.youtube-demo__placeholder { display: flex; padding: clamp(16px, 4vw, 48px); flex-direction: column; justify-content: center; align-items: center; text-align: center; color: #d9e2ec; }
.youtube-demo__placeholder h3 { margin: 16px 0 10px; color: white; font-size: clamp(1.15rem, 2.5vw, 1.65rem); }
.youtube-demo__caption { padding: 20px 24px; border-top: 1px solid #486581; text-align: center; color: #d9e2ec; }
.youtube-demo__caption p { max-width: 600px; margin: 0 auto 14px; }
.youtube-demo__play { display: grid; place-items: center; width: 52px; height: 52px; padding-left: 3px; border: 1px solid #5e8b99; border-radius: 50%; color: #b9f2e5; }
.youtube-demo__caption code { padding: 4px 10px; border: 1px solid #5e8b99; border-radius: 6px; color: white; overflow-wrap: anywhere; }
.youtube-demo__caption .youtube-demo__note { margin: 12px 0 0; color: #bcccdc; font-size: .82rem; }
@media (max-width: 430px) { .youtube-demo__play { width: 36px; height: 36px; font-size: .8rem; } .youtube-demo__placeholder h3 { margin: 12px 0 0; } .youtube-demo__caption { padding: 18px; font-size: .85rem; } }
@media print { .youtube-demo { border-color: #666; background: white; } .youtube-demo__frame { aspect-ratio: auto; } iframe { display: none; } .youtube-demo__placeholder, .youtube-demo__caption { padding: 12px; color: #222; } .youtube-demo__placeholder h3, .youtube-demo__caption code, .youtube-demo__caption .youtube-demo__note { color: #222; } .youtube-demo__play { display: none; } }
</style>
