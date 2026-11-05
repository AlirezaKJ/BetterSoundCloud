import { mount } from 'svelte'
import '../tokens.css'
import Player from './Player.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app is missing from player/index.html')

mount(Player, { target })
