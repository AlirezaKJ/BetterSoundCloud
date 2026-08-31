import { mount } from 'svelte'
import '../tokens.css'
import Settings from './Settings.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app is missing from settings/index.html')

mount(Settings, { target })
