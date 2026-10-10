// Manual board editor: select a cell on the grid, then place a tile of the
// chosen value in it (or clear it). Values are restricted to powers of two
// that the AI's 4-bit-per-cell board encoding supports: 2..32768 (2^1..2^15).
import {t} from "./i18n.js"

/**
 * Set a cell of the game board and re-render it.
 * @param {object} game live GameManager instance
 * @param {Function} TileClass Tile constructor taken from a live tile
 * @param {{x: number, y: number}} position
 * @param {number} value 0 clears the cell, otherwise a power of two
 */
export function placeTile(game, TileClass, position, value) {
  const { x, y } = position
  if (value === 0) {
    game.grid.cells[x][y] = null
  } else {
    game.grid.cells[x][y] = new TileClass(position, value)
  }
  game.actuator.actuate(game.grid, {
    score: game.score,
    bestScore: game.storageManager.getBestScore(),
    terminated: false,
  })
}

/**
 * Index of the cell whose center is closest to the point (row-major order,
 * index = y * 4 + x), or -1 if the point is too far from any cell.
 * @param {ArrayLike<{getBoundingClientRect: () => {left: number, top: number, width: number, height: number}}>} cells
 * @param {number} clientX
 * @param {number} clientY
 */
export function cellIndexFromPoint(cells, clientX, clientY) {
  let bestIndex = -1
  let bestDistance = Infinity
  let cellWidth = 0
  for (let i = 0; i < cells.length; ++i) {
    const rect = cells[i].getBoundingClientRect()
    cellWidth = rect.width
    const dx = clientX - (rect.left + rect.width / 2)
    const dy = clientY - (rect.top + rect.height / 2)
    const distance = dx * dx + dy * dy
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = i
    }
  }
  // Allow clicks in the gutters around a cell, but not far outside the grid.
  if (bestIndex === -1 || bestDistance > cellWidth * cellWidth) return -1
  return bestIndex
}

/**
 * @param {object} game live GameManager instance
 * @param {Function} TileClass Tile constructor taken from a live tile
 * @param {{stopAI: () => void}} options
 */
export function initBoardEditor(game, TileClass, options) {
  const toggle = document.getElementById('ai-edit')
  const panel = document.querySelector('.edit-panel')
  const gridContainer = document.querySelector('.grid-container')
  const gameContainer = document.querySelector('.game-container')
  const cells = gridContainer.querySelectorAll('.grid-cell')

  /** @type {{x: number, y: number} | null} */
  let selected = null
  let editing = false

  function highlight(index, on) {
    cells[index].classList.toggle('edit-selected', on)
  }

  function setEditing(on) {
    editing = on
    panel.hidden = !on
    toggle.textContent = on ? t('editDone') : t('editBoard')
    if (on) {
      // The AI and manual editing must not fight over the board.
      options.stopAI()
      game.actuator.clearMessage()
    } else if (selected) {
      highlight(selected.y * 4 + selected.x, false)
      selected = null
    }
  }

  toggle.addEventListener('click', () => setEditing(!editing))

  // Listen on the game container: tiles render in a sibling layer above the
  // grid, so clicks on occupied cells never bubble through .grid-container.
  gameContainer.addEventListener('click', (e) => {
    if (!editing) return
    if (e.target && e.target.closest && e.target.closest('.game-message')) return
    const index = cellIndexFromPoint(cells, e.clientX, e.clientY)
    if (index < 0) return
    if (selected) highlight(selected.y * 4 + selected.x, false)
    selected = { x: index % 4, y: Math.floor(index / 4) }
    highlight(index, true)
  })

  for (const button of panel.querySelectorAll('.edit-value')) {
    button.addEventListener('click', (e) => {
      e.preventDefault()
      if (!selected) return
      options.stopAI()
      placeTile(game, TileClass, selected, Number(button.dataset.value))
    })
  }

  window.addEventListener('i18nchange', () => {
    toggle.textContent = editing ? t('editDone') : t('editBoard')
  })

  toggle.textContent = t('editBoard')
}
