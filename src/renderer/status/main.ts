import { mount } from 'svelte'
import '../tokens.css'
import Status from './Status.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app is missing from status/index.html')

mount(Status, { target })
