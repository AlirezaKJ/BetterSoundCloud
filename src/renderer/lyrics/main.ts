import { mount } from 'svelte'
import '../tokens.css'
import Lyrics from './Lyrics.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app is missing from lyrics/index.html')

mount(Lyrics, { target })
