<script setup lang="ts">
defineProps<{
  enabled?: boolean
  disabled?: boolean
  count?: number
  textNumber?: string
  items?: Array<{ label: string, value: string }>
  settings?: { nested: boolean }
}>();
</script>

<template>
  <section class="panel">
    <slot />
    <div class="actions">
      <div><slot name="primaryLabel" /></div>
      <div><slot name="secondaryLabel" /></div>
    </div>
  </section>
</template>
