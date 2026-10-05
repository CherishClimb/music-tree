export type TreeStage = 1 | 2 | 3 | 4 | 5

export type LeafColor = 'blue' | 'turquoise' | 'lavender' | 'pink'

export interface TreeStageBlueprint {
  stage: TreeStage
  name: string
  trunkPath: string
  trunkHighlightPath: string
  structureScale: { x: number; y: number }
  crownScale: { x: number; y: number }
  rootPaths: string[]
  branchIds: string[]
  availableLeafSlotIds: string[]
  availableFlowerSlotIds: string[]
  availableFruitSlotIds: string[]
  // Defaults to true for existing stages; false keeps unsupported fruit artwork out of the render plan.
  allowFruitOverflow?: boolean
  availableCreatureSlotIds: string[]
  availableDecorationSlotIds: string[]
}

export interface TreeBranch {
  id: string
  parentBranchId: 'trunk' | string
  unlockedAtStage: TreeStage
  pathDefinition: string
  silhouettePath: string
  width: number
  visible?: boolean
}

export interface TreeLeafSlot {
  id: string
  branchId: string
  x: number
  y: number
  attachmentX: number
  attachmentY: number
  rotation: number
  size: 'medium' | 'large'
  color: LeafColor
}

export interface TreeOrnamentSlot {
  id: string
  branchId: string
  x: number
  y: number
}

export const STAGE_ONE_TRUNK_PATH = 'M154 410 C168 394 173 373 176 345 C179 316 171 287 181 257 C188 237 188 218 185 199 C192 183 197 165 200 147 C205 167 214 185 211 205 C208 225 214 241 210 261 C205 287 217 316 216 345 C215 374 228 397 242 410 C226 404 212 405 200 412 C184 404 169 405 154 410 Z'
export const STAGE_ONE_TRUNK_HIGHLIGHT_PATH = 'M181 390 C188 363 184 334 185 309 C186 280 190 258 195 239 C200 219 195 199 198 180 C199 170 200 158 200 149'

export const TREE_BRANCHES: TreeBranch[] = [
  { id: 'branch_left_main', parentBranchId: 'trunk', unlockedAtStage: 1, pathDefinition: 'M185 287 C164 272 145 243 108 207', silhouettePath: 'M178 293 C160 279 140 250 104 212 C101 209 103 204 108 205 C147 237 169 263 191 280 C194 284 184 296 178 293 Z', width: 12 },
  { id: 'branch_crown_main', parentBranchId: 'trunk', unlockedAtStage: 1, pathDefinition: 'M197 258 C195 224 201 180 203 133', silhouettePath: 'M189 260 C190 226 196 181 200 133 C201 128 207 128 208 134 C208 181 204 225 205 260 C204 267 191 267 189 260 Z', width: 11 },
  { id: 'branch_right_main', parentBranchId: 'trunk', unlockedAtStage: 1, pathDefinition: 'M211 294 C235 278 264 243 304 207', silhouettePath: 'M205 286 C232 269 258 236 301 203 C305 200 310 205 306 210 C268 249 240 284 215 301 C210 304 202 292 205 286 Z', width: 12 },
  { id: 'branch_left_lower', parentBranchId: 'branch_left_main', unlockedAtStage: 1, pathDefinition: 'M158 264 C136 261 114 255 91 247', silhouettePath: 'M160 258 C137 256 115 251 92 244 C87 242 85 248 90 251 C114 261 137 268 158 270 C163 270 165 260 160 258 Z', width: 7 },
  { id: 'branch_left_upper', parentBranchId: 'branch_left_main', unlockedAtStage: 1, pathDefinition: 'M140 242 C121 225 105 204 89 184', silhouettePath: 'M144 236 C124 219 108 199 92 181 C89 177 84 182 87 187 C102 209 119 231 136 248 C140 251 148 241 144 236 Z', width: 7 },
  { id: 'branch_crown_left', parentBranchId: 'branch_crown_main', unlockedAtStage: 1, pathDefinition: 'M200 201 C183 188 166 171 150 151', silhouettePath: 'M204 195 C186 182 169 165 153 147 C150 143 145 148 148 153 C163 176 181 194 197 207 C201 210 208 199 204 195 Z', width: 7 },
  { id: 'branch_crown_right', parentBranchId: 'branch_crown_main', unlockedAtStage: 1, pathDefinition: 'M202 181 C220 169 237 153 252 134', silhouettePath: 'M198 175 C217 163 234 148 249 131 C252 127 258 132 255 137 C240 159 222 176 205 187 C201 190 194 179 198 175 Z', width: 7 },
  { id: 'branch_right_upper', parentBranchId: 'branch_right_main', unlockedAtStage: 1, pathDefinition: 'M256 252 C279 247 303 236 325 222', silhouettePath: 'M254 246 C277 241 301 231 322 218 C327 215 330 221 326 225 C305 242 281 253 258 259 C253 260 249 248 254 246 Z', width: 7 },
  { id: 'branch_left_outer', parentBranchId: 'branch_left_lower', unlockedAtStage: 3, pathDefinition: 'M112 257 C89 245 70 229 56 210', silhouettePath: 'M115 252 C91 240 72 225 58 207 C55 203 51 207 53 212 C68 234 88 251 109 263 C113 265 118 255 115 252 Z', width: 6 },
  { id: 'branch_right_outer', parentBranchId: 'branch_right_upper', unlockedAtStage: 3, pathDefinition: 'M286 235 C308 225 327 210 340 191', silhouettePath: 'M283 230 C305 220 324 205 337 188 C340 184 345 188 343 193 C330 215 311 231 289 241 C285 243 280 233 283 230 Z', width: 6 },
  { id: 'branch_crown_high_left', parentBranchId: 'branch_crown_main', unlockedAtStage: 4, pathDefinition: 'M200 171 C188 147 181 120 181 92', silhouettePath: 'M204 169 C193 145 186 119 185 92 C185 88 179 87 178 92 C176 121 182 149 195 176 C197 180 206 173 204 169 Z', width: 6 },
  { id: 'branch_crown_high_right', parentBranchId: 'branch_crown_main', unlockedAtStage: 4, pathDefinition: 'M202 145 C217 123 228 99 231 75', silhouettePath: 'M198 142 C213 120 223 97 227 74 C228 70 234 70 235 75 C233 101 223 127 207 151 C205 155 196 146 198 142 Z', width: 6 },
  { id: 'branch_left_crown_tip', parentBranchId: 'branch_crown_high_left', unlockedAtStage: 5, pathDefinition: 'M184 116 C166 102 151 86 140 68', silhouettePath: 'M187 111 C169 98 154 82 143 65 C140 61 135 65 137 70 C148 91 163 108 181 122 C185 125 190 114 187 111 Z', width: 5 },
  { id: 'branch_right_crown_tip', parentBranchId: 'branch_crown_high_right', unlockedAtStage: 5, pathDefinition: 'M225 105 C242 92 257 77 268 60', silhouettePath: 'M222 101 C239 88 254 74 265 57 C268 53 273 57 271 62 C260 82 245 99 228 112 C224 115 219 104 222 101 Z', width: 5 },
  { id: 'branch_stage2_upper_right_main', parentBranchId: 'trunk', unlockedAtStage: 2, pathDefinition: 'M207 231 C238 214 267 190 291 158', silhouettePath: 'M202 225 C234 208 263 185 287 154 C291 149 297 154 293 160 C269 197 240 222 211 238 Z', width: 10 },
  { id: 'branch_stage2_left_extension', parentBranchId: 'branch_left_lower', unlockedAtStage: 2, pathDefinition: 'M120 256 C96 248 76 235 62 218', silhouettePath: 'M122 251 C98 243 79 231 65 215 C62 211 57 215 59 220 C73 240 94 254 118 262 C122 263 126 253 122 251 Z', width: 6 },
  { id: 'branch_stage2_right_extension', parentBranchId: 'branch_right_upper', unlockedAtStage: 2, pathDefinition: 'M294 238 C316 230 333 218 344 202', silhouettePath: 'M292 233 C313 225 330 214 341 199 C344 195 349 199 347 204 C336 223 318 237 297 244 C293 246 289 236 292 233 Z', width: 6 },
  { id: 'branch_stage2_upper_left_twig', parentBranchId: 'branch_crown_left', unlockedAtStage: 2, pathDefinition: 'M172 176 C155 161 143 145 136 127', silhouettePath: 'M175 172 C158 157 147 142 139 125 C137 121 132 123 133 128 C139 149 152 167 169 182 C172 185 178 175 175 172 Z', width: 5.5 },
  { id: 'branch_stage2_upper_right_twig', parentBranchId: 'branch_stage2_upper_right_main', unlockedAtStage: 2, pathDefinition: 'M258 196 C276 184 291 176 306 173', silhouettePath: 'M255 192 C273 180 289 172 305 170 C309 169 311 175 307 177 C291 182 277 191 261 202 C258 204 252 195 255 192 Z', width: 5.5 },
  { id: 'branch_stage3_left_middle_main', parentBranchId: 'trunk', unlockedAtStage: 3, pathDefinition: 'M187 240 C157 220 128 194 101 164', silhouettePath: 'M181 246 C153 226 123 200 97 168 C93 163 99 157 104 162 C134 190 164 215 192 233 Z', width: 10 },
  { id: 'branch_stage3_right_middle_main', parentBranchId: 'trunk', unlockedAtStage: 3, pathDefinition: 'M207 218 C236 198 264 170 286 137', silhouettePath: 'M202 211 C232 191 259 165 282 133 C286 128 292 134 288 140 C267 176 239 205 211 225 Z', width: 10 },
  { id: 'branch_stage3_memory_twig', parentBranchId: 'branch_stage3_left_middle_main', unlockedAtStage: 3, pathDefinition: 'M137 202 C116 190 99 175 87 158', silhouettePath: 'M140 197 C119 186 102 172 90 155 C87 151 82 155 84 160 C96 181 114 197 134 208 C138 210 143 200 140 197 Z', width: 5.5 },
  { id: 'branch_stage3_crown_twig', parentBranchId: 'branch_crown_main', unlockedAtStage: 3, pathDefinition: 'M201 164 C188 145 180 125 178 105', silhouettePath: 'M205 161 C192 143 184 123 182 104 C182 100 176 99 175 104 C175 127 182 149 196 169 C199 172 208 164 205 161 Z', width: 5.5 },
  { id: 'branch_stage3_perch_twig', parentBranchId: 'branch_stage3_right_middle_main', unlockedAtStage: 3, pathDefinition: 'M256 177 C276 166 292 152 304 136', silhouettePath: 'M253 172 C273 162 289 148 301 133 C304 129 309 133 307 138 C295 157 279 172 260 183 C256 185 250 175 253 172 Z', width: 6 },
  { id: 'branch_stage4_left_shelter_main', parentBranchId: 'trunk', unlockedAtStage: 4, pathDefinition: 'M180 318 C151 307 126 291 105 270', silhouettePath: 'M176 325 C147 314 122 298 101 275 C97 270 102 265 108 268 C132 288 157 301 185 310 Z', width: 11 },
  { id: 'branch_stage4_right_shelter_main', parentBranchId: 'trunk', unlockedAtStage: 4, pathDefinition: 'M218 319 C247 307 273 288 295 265', silhouettePath: 'M214 311 C244 299 269 281 291 260 C296 256 301 262 297 268 C277 293 252 313 222 327 Z', width: 11 },
  { id: 'branch_stage4_left_layer_twig', parentBranchId: 'branch_stage4_left_shelter_main', unlockedAtStage: 4, pathDefinition: 'M125 301 C103 299 84 292 69 281', silhouettePath: 'M126 296 C104 294 87 287 72 278 C68 275 64 280 67 284 C82 298 102 305 124 307 C128 307 130 297 126 296 Z', width: 6, visible: false },
  { id: 'branch_stage4_right_layer_twig', parentBranchId: 'branch_stage4_right_shelter_main', unlockedAtStage: 4, pathDefinition: 'M276 296 C297 290 315 280 329 266', silhouettePath: 'M274 291 C295 285 312 276 326 263 C329 260 334 264 332 269 C318 285 300 297 279 302 C275 303 271 293 274 291 Z', width: 6, visible: false },
  { id: 'branch_stage4_mid_left_twig', parentBranchId: 'branch_stage3_left_middle_main', unlockedAtStage: 4, pathDefinition: 'M120 184 C102 166 91 146 87 126', silhouettePath: 'M124 180 C106 163 95 144 91 125 C90 121 84 121 83 126 C86 149 97 171 116 190 C119 193 127 183 124 180 Z', width: 5.5 },
  { id: 'branch_stage4_mid_right_twig', parentBranchId: 'branch_stage3_right_middle_main', unlockedAtStage: 4, pathDefinition: 'M270 160 C291 148 308 132 319 114', silhouettePath: 'M267 155 C288 144 304 128 316 111 C318 107 324 111 322 116 C311 137 294 155 274 166 C270 168 264 158 267 155 Z', width: 5.5 },
  { id: 'branch_stage5_outer_left_main', parentBranchId: 'trunk', unlockedAtStage: 5, pathDefinition: 'M177 275 C139 250 102 220 69 182', silhouettePath: 'M171 282 C134 257 97 226 65 187 C60 181 67 175 72 180 C108 216 146 245 183 267 Z', width: 10 },
  { id: 'branch_stage5_outer_right_main', parentBranchId: 'trunk', unlockedAtStage: 5, pathDefinition: 'M215 265 C254 239 293 207 326 168', silhouettePath: 'M210 257 C249 231 288 200 322 164 C327 159 333 165 328 171 C296 212 258 247 220 273 Z', width: 10 },
  { id: 'branch_stage5_memory_outer_twig', parentBranchId: 'branch_stage5_outer_left_main', unlockedAtStage: 5, pathDefinition: 'M109 225 C88 211 72 194 62 176', silhouettePath: 'M112 220 C91 207 76 191 65 173 C63 169 57 172 59 177 C68 199 85 218 105 231 C109 233 115 223 112 220 Z', width: 5.5, visible: false },
  { id: 'branch_stage5_concert_outer_twig', parentBranchId: 'branch_stage5_outer_right_main', unlockedAtStage: 5, pathDefinition: 'M286 213 C307 201 324 185 335 168', silhouettePath: 'M283 208 C304 197 321 181 332 165 C335 161 340 165 338 170 C327 191 310 208 290 219 C286 221 280 211 283 208 Z', width: 5.5, visible: false },
  { id: 'branch_stage5_peak_left_twig', parentBranchId: 'branch_crown_high_left', unlockedAtStage: 5, pathDefinition: 'M183 94 C174 82 168 69 166 56', silhouettePath: 'M187 91 C178 79 172 67 170 55 C169 51 163 51 162 56 C163 71 169 86 179 99 C182 102 190 94 187 91 Z', width: 5, visible: false },
  { id: 'branch_stage5_peak_right_twig', parentBranchId: 'branch_crown_high_right', unlockedAtStage: 5, pathDefinition: 'M231 76 C241 66 249 55 253 44', silhouettePath: 'M228 72 C238 62 246 52 250 42 C252 38 257 40 257 45 C253 58 246 70 236 81 C233 84 225 75 228 72 Z', width: 5, visible: false },
  { id: 'branch_stage5_lower_left_twig', parentBranchId: 'branch_stage4_left_shelter_main', unlockedAtStage: 5, pathDefinition: 'M104 290 C86 281 72 269 62 255', silhouettePath: 'M107 285 C89 277 75 266 65 252 C62 248 57 252 59 257 C69 274 84 288 101 296 C105 298 110 288 107 285 Z', width: 5.5, visible: false },
]

export const TREE_LEAF_SLOTS: TreeLeafSlot[] = [
  { id: 'leaf_slot_01', branchId: 'branch_left_main', x: 96, y: 194, attachmentX: 108, attachmentY: 207, rotation: -42, size: 'large', color: 'blue' },
  { id: 'leaf_slot_02', branchId: 'branch_left_main', x: 130, y: 225, attachmentX: 141, attachmentY: 242, rotation: -31, size: 'medium', color: 'lavender' },
  { id: 'leaf_slot_03', branchId: 'branch_left_lower', x: 78, y: 237, attachmentX: 91, attachmentY: 247, rotation: -48, size: 'large', color: 'turquoise' },
  { id: 'leaf_slot_04', branchId: 'branch_left_lower', x: 111, y: 243, attachmentX: 121, attachmentY: 257, rotation: -36, size: 'medium', color: 'pink' },
  { id: 'leaf_slot_05', branchId: 'branch_left_upper', x: 77, y: 171, attachmentX: 89, attachmentY: 184, rotation: -32, size: 'large', color: 'blue' },
  { id: 'leaf_slot_06', branchId: 'branch_left_upper', x: 105, y: 195, attachmentX: 115, attachmentY: 216, rotation: -22, size: 'medium', color: 'lavender' },
  { id: 'leaf_slot_07', branchId: 'branch_crown_main', x: 188, y: 124, attachmentX: 203, attachmentY: 133, rotation: -12, size: 'medium', color: 'turquoise' },
  { id: 'leaf_slot_08', branchId: 'branch_crown_main', x: 219, y: 147, attachmentX: 202, attachmentY: 158, rotation: 22, size: 'large', color: 'pink' },
  { id: 'leaf_slot_09', branchId: 'branch_crown_left', x: 138, y: 138, attachmentX: 150, attachmentY: 151, rotation: -32, size: 'large', color: 'blue' },
  { id: 'leaf_slot_10', branchId: 'branch_crown_left', x: 163, y: 158, attachmentX: 174, attachmentY: 179, rotation: -18, size: 'medium', color: 'lavender' },
  { id: 'leaf_slot_11', branchId: 'branch_crown_right', x: 264, y: 121, attachmentX: 252, attachmentY: 134, rotation: 34, size: 'large', color: 'turquoise' },
  { id: 'leaf_slot_12', branchId: 'branch_crown_right', x: 238, y: 143, attachmentX: 226, attachmentY: 163, rotation: 26, size: 'medium', color: 'pink' },
  { id: 'leaf_slot_13', branchId: 'branch_right_main', x: 316, y: 194, attachmentX: 304, attachmentY: 207, rotation: 44, size: 'large', color: 'blue' },
  { id: 'leaf_slot_14', branchId: 'branch_right_upper', x: 339, y: 211, attachmentX: 325, attachmentY: 222, rotation: 56, size: 'large', color: 'lavender' },
  { id: 'leaf_slot_15', branchId: 'branch_right_upper', x: 286, y: 214, attachmentX: 296, attachmentY: 206, rotation: 68, size: 'medium', color: 'turquoise' },
  { id: 'leaf_slot_16', branchId: 'branch_left_outer', x: 39, y: 194, attachmentX: 49, attachmentY: 209, rotation: -44, size: 'large', color: 'pink' },
  { id: 'leaf_slot_17', branchId: 'branch_left_outer', x: 73, y: 231, attachmentX: 84, attachmentY: 242, rotation: -58, size: 'medium', color: 'blue' },
  { id: 'leaf_slot_18', branchId: 'branch_right_outer', x: 356, y: 255, attachmentX: 345, attachmentY: 245, rotation: 58, size: 'large', color: 'lavender' },
  { id: 'leaf_slot_19', branchId: 'branch_right_outer', x: 322, y: 226, attachmentX: 312, attachmentY: 219, rotation: 70, size: 'medium', color: 'turquoise' },
  { id: 'leaf_slot_20', branchId: 'branch_crown_high_left', x: 158, y: 59, attachmentX: 169, attachmentY: 74, rotation: -20, size: 'large', color: 'blue' },
  { id: 'leaf_slot_21', branchId: 'branch_crown_high_left', x: 177, y: 103, attachmentX: 181, attachmentY: 123, rotation: -12, size: 'medium', color: 'pink' },
  { id: 'leaf_slot_22', branchId: 'branch_crown_high_right', x: 241, y: 55, attachmentX: 231, attachmentY: 70, rotation: 24, size: 'large', color: 'turquoise' },
  { id: 'leaf_slot_23', branchId: 'branch_crown_high_right', x: 220, y: 101, attachmentX: 216, attachmentY: 122, rotation: 16, size: 'medium', color: 'lavender' },
  { id: 'leaf_slot_24', branchId: 'branch_left_crown_tip', x: 96, y: 63, attachmentX: 109, attachmentY: 50, rotation: -42, size: 'large', color: 'lavender' },
  { id: 'leaf_slot_25', branchId: 'branch_left_crown_tip', x: 134, y: 84, attachmentX: 145, attachmentY: 89, rotation: -35, size: 'medium', color: 'turquoise' },
  { id: 'leaf_slot_26', branchId: 'branch_right_crown_tip', x: 305, y: 63, attachmentX: 293, attachmentY: 50, rotation: 42, size: 'large', color: 'pink' },
  { id: 'leaf_slot_27', branchId: 'branch_right_crown_tip', x: 268, y: 84, attachmentX: 256, attachmentY: 89, rotation: 35, size: 'medium', color: 'blue' },
  { id: 'leaf_slot_028', branchId: 'branch_stage2_upper_right_main', x: 298, y: 146, attachmentX: 289, attachmentY: 160, rotation: 38, size: 'large', color: 'pink' },
  { id: 'leaf_slot_029', branchId: 'branch_stage2_upper_right_main', x: 266, y: 176, attachmentX: 276, attachmentY: 177, rotation: 46, size: 'medium', color: 'turquoise' },
  { id: 'leaf_slot_030', branchId: 'branch_stage2_left_extension', x: 43, y: 199, attachmentX: 54, attachmentY: 212, rotation: -48, size: 'large', color: 'lavender' },
  { id: 'leaf_slot_031', branchId: 'branch_stage2_left_extension', x: 76, y: 226, attachmentX: 70, attachmentY: 232, rotation: -62, size: 'medium', color: 'blue' },
  { id: 'leaf_slot_032', branchId: 'branch_stage2_right_extension', x: 362, y: 187, attachmentX: 351, attachmentY: 198, rotation: 48, size: 'large', color: 'turquoise' },
  { id: 'leaf_slot_033', branchId: 'branch_stage2_right_extension', x: 332, y: 209, attachmentX: 338, attachmentY: 216, rotation: 62, size: 'medium', color: 'pink' },
  { id: 'leaf_slot_034', branchId: 'branch_stage2_upper_left_twig', x: 117, y: 104, attachmentX: 127, attachmentY: 118, rotation: -30, size: 'large', color: 'blue' },
  { id: 'leaf_slot_035', branchId: 'branch_stage2_upper_left_twig', x: 143, y: 137, attachmentX: 148, attachmentY: 153, rotation: -22, size: 'medium', color: 'lavender' },
  { id: 'leaf_slot_036', branchId: 'branch_stage2_upper_right_twig', x: 329, y: 158, attachmentX: 320, attachmentY: 167, rotation: 58, size: 'large', color: 'pink' },
  { id: 'leaf_slot_037', branchId: 'branch_stage2_upper_right_twig', x: 295, y: 168, attachmentX: 301, attachmentY: 171, rotation: 68, size: 'medium', color: 'turquoise' },
  { id: 'leaf_slot_038', branchId: 'branch_stage3_left_middle_main', x: 90, y: 151, attachmentX: 101, attachmentY: 164, rotation: -42, size: 'large', color: 'pink' },
  { id: 'leaf_slot_039', branchId: 'branch_stage3_left_middle_main', x: 122, y: 177, attachmentX: 129, attachmentY: 195, rotation: -30, size: 'medium', color: 'blue' },
  { id: 'leaf_slot_040', branchId: 'branch_stage3_right_middle_main', x: 296, y: 124, attachmentX: 286, attachmentY: 137, rotation: 36, size: 'large', color: 'lavender' },
  { id: 'leaf_slot_041', branchId: 'branch_stage3_right_middle_main', x: 272, y: 151, attachmentX: 275, attachmentY: 153, rotation: 44, size: 'medium', color: 'turquoise' },
  { id: 'leaf_slot_042', branchId: 'branch_stage3_memory_twig', x: 64, y: 141, attachmentX: 75, attachmentY: 154, rotation: -45, size: 'large', color: 'blue' },
  { id: 'leaf_slot_043', branchId: 'branch_stage3_crown_twig', x: 149, y: 82, attachmentX: 159, attachmentY: 96, rotation: -24, size: 'large', color: 'pink' },
  { id: 'leaf_slot_044', branchId: 'branch_stage3_perch_twig', x: 332, y: 169, attachmentX: 322, attachmentY: 175, rotation: 70, size: 'medium', color: 'lavender' },
  { id: 'leaf_slot_045', branchId: 'branch_stage4_left_shelter_main', x: 93, y: 257, attachmentX: 105, attachmentY: 270, rotation: -48, size: 'large', color: 'turquoise' },
  { id: 'leaf_slot_046', branchId: 'branch_stage4_left_shelter_main', x: 120, y: 278, attachmentX: 128, attachmentY: 293, rotation: -42, size: 'medium', color: 'pink' },
  { id: 'leaf_slot_047', branchId: 'branch_stage4_right_shelter_main', x: 306, y: 251, attachmentX: 295, attachmentY: 265, rotation: 46, size: 'large', color: 'blue' },
  { id: 'leaf_slot_048', branchId: 'branch_stage4_right_shelter_main', x: 280, y: 277, attachmentX: 272, attachmentY: 289, rotation: 40, size: 'medium', color: 'lavender' },
  { id: 'leaf_slot_049', branchId: 'branch_stage4_left_layer_twig', x: 39, y: 282, attachmentX: 50, attachmentY: 291, rotation: -66, size: 'large', color: 'pink' },
  { id: 'leaf_slot_050', branchId: 'branch_stage4_right_layer_twig', x: 361, y: 270, attachmentX: 350, attachmentY: 281, rotation: 62, size: 'large', color: 'turquoise' },
  { id: 'leaf_slot_051', branchId: 'branch_stage4_mid_left_twig', x: 61, y: 101, attachmentX: 72, attachmentY: 116, rotation: -34, size: 'large', color: 'blue' },
  { id: 'leaf_slot_052', branchId: 'branch_stage4_mid_left_twig', x: 84, y: 137, attachmentX: 87, attachmentY: 149, rotation: -28, size: 'medium', color: 'lavender' },
  { id: 'leaf_slot_053', branchId: 'branch_stage4_mid_right_twig', x: 345, y: 98, attachmentX: 335, attachmentY: 111, rotation: 36, size: 'large', color: 'pink' },
  { id: 'leaf_slot_054', branchId: 'branch_stage4_mid_right_twig', x: 316, y: 124, attachmentX: 319, attachmentY: 131, rotation: 44, size: 'medium', color: 'turquoise' },
  { id: 'leaf_slot_055', branchId: 'branch_crown_high_left', x: 147, y: 43, attachmentX: 158, attachmentY: 59, rotation: -20, size: 'large', color: 'pink' },
  { id: 'leaf_slot_056', branchId: 'branch_crown_high_right', x: 252, y: 40, attachmentX: 241, attachmentY: 55, rotation: 24, size: 'large', color: 'blue' },
  { id: 'leaf_slot_057', branchId: 'branch_stage5_outer_left_main', x: 57, y: 167, attachmentX: 69, attachmentY: 182, rotation: -42, size: 'large', color: 'lavender' },
  { id: 'leaf_slot_058', branchId: 'branch_stage5_outer_left_main', x: 91, y: 199, attachmentX: 102, attachmentY: 218, rotation: -34, size: 'medium', color: 'turquoise' },
  { id: 'leaf_slot_059', branchId: 'branch_stage5_outer_right_main', x: 338, y: 153, attachmentX: 326, attachmentY: 168, rotation: 40, size: 'large', color: 'pink' },
  { id: 'leaf_slot_060', branchId: 'branch_stage5_outer_right_main', x: 305, y: 187, attachmentX: 294, attachmentY: 206, rotation: 34, size: 'medium', color: 'blue' },
  { id: 'leaf_slot_061', branchId: 'branch_stage5_memory_outer_twig', x: 29, y: 155, attachmentX: 40, attachmentY: 169, rotation: -48, size: 'large', color: 'blue' },
  { id: 'leaf_slot_062', branchId: 'branch_stage5_concert_outer_twig', x: 369, y: 151, attachmentX: 357, attachmentY: 166, rotation: 48, size: 'large', color: 'lavender' },
  { id: 'leaf_slot_063', branchId: 'branch_stage5_peak_left_twig', x: 137, y: 49, attachmentX: 145, attachmentY: 35, rotation: -18, size: 'medium', color: 'pink' },
  { id: 'leaf_slot_064', branchId: 'branch_stage5_peak_right_twig', x: 266, y: 48, attachmentX: 258, attachmentY: 34, rotation: 20, size: 'medium', color: 'turquoise' },
]

export const TREE_FLOWER_SLOTS: TreeOrnamentSlot[] = [
  { id: 'flower_slot_01', branchId: 'branch_left_lower', x: 125, y: 258 },
  { id: 'flower_slot_02', branchId: 'branch_right_main', x: 276, y: 237 },
  { id: 'flower_slot_03', branchId: 'branch_left_upper', x: 96, y: 176 },
  { id: 'flower_slot_04', branchId: 'branch_crown_right', x: 236, y: 143 },
  { id: 'flower_slot_05', branchId: 'branch_left_outer', x: 71, y: 230 },
  { id: 'flower_slot_06', branchId: 'branch_right_outer', x: 328, y: 231 },
  { id: 'flower_slot_007', branchId: 'branch_stage4_left_shelter_main', x: 111, y: 294 },
  { id: 'flower_slot_008', branchId: 'branch_stage4_right_shelter_main', x: 289, y: 290 },
  { id: 'flower_slot_009', branchId: 'branch_stage4_mid_left_twig', x: 87, y: 149 },
  { id: 'flower_slot_010', branchId: 'branch_stage5_outer_left_main', x: 102, y: 218 },
  { id: 'flower_slot_011', branchId: 'branch_stage5_outer_right_main', x: 294, y: 206 },
  { id: 'flower_slot_012', branchId: 'branch_stage5_concert_outer_twig', x: 357, y: 166 },
]

export const TREE_FRUIT_SLOTS: TreeOrnamentSlot[] = [
  { id: 'fruit_slot_01', branchId: 'branch_right_main', x: 276, y: 220 },
  { id: 'fruit_slot_02', branchId: 'branch_left_main', x: 121, y: 230 },
  { id: 'fruit_slot_03', branchId: 'branch_crown_high_left', x: 177, y: 111 },
  { id: 'fruit_slot_04', branchId: 'branch_crown_high_right', x: 222, y: 109 },
  { id: 'fruit_slot_005', branchId: 'branch_stage4_left_shelter_main', x: 126, y: 298 },
  { id: 'fruit_slot_006', branchId: 'branch_stage4_right_shelter_main', x: 274, y: 296 },
  { id: 'fruit_slot_007', branchId: 'branch_stage5_outer_left_main', x: 112, y: 225 },
  { id: 'fruit_slot_008', branchId: 'branch_stage5_outer_right_main', x: 285, y: 214 },
  { id: 'fruit_slot_009', branchId: 'branch_stage5_memory_outer_twig', x: 57, y: 184 },
  { id: 'fruit_slot_010', branchId: 'branch_stage5_concert_outer_twig', x: 340, y: 178 },
]

export const TREE_CREATURE_SLOTS: TreeOrnamentSlot[] = [
  { id: 'creature_slot_001', branchId: 'branch_stage3_perch_twig', x: 303, y: 166 },
  { id: 'creature_slot_002', branchId: 'branch_stage4_left_shelter_main', x: 101, y: 286 },
  { id: 'creature_slot_003', branchId: 'branch_stage4_right_shelter_main', x: 300, y: 282 },
  { id: 'creature_slot_004', branchId: 'branch_stage5_outer_left_main', x: 86, y: 211 },
  { id: 'creature_slot_005', branchId: 'branch_stage5_outer_right_main', x: 314, y: 190 },
]

export const TREE_DECORATION_SLOTS: TreeOrnamentSlot[] = [
  { id: 'decoration_slot_001', branchId: 'branch_stage3_memory_twig', x: 93, y: 171 },
  { id: 'decoration_slot_002', branchId: 'branch_stage4_mid_left_twig', x: 79, y: 135 },
  { id: 'decoration_slot_003', branchId: 'branch_stage4_mid_right_twig', x: 319, y: 129 },
  { id: 'decoration_slot_004', branchId: 'branch_stage5_memory_outer_twig', x: 54, y: 181 },
  { id: 'decoration_slot_005', branchId: 'branch_stage5_concert_outer_twig', x: 343, y: 176 },
]

const branchIdsFor = (stage: TreeStage) => TREE_BRANCHES.filter((branch) => branch.unlockedAtStage <= stage).map((branch) => branch.id)
const roots = ['M185 397 C167 409 145 417 119 421', 'M214 397 C232 408 255 416 282 420', 'M199 402 C197 418 192 430 183 438']
const STAGE_ONE_BRANCH_IDS = ['branch_left_main', 'branch_crown_main', 'branch_right_main', 'branch_left_lower', 'branch_left_upper', 'branch_crown_left', 'branch_crown_right', 'branch_right_upper']
const STAGE_ONE_LEAF_IDS = TREE_LEAF_SLOTS.slice(0, 14).map((slot) => slot.id)
const STAGE_TWO_LEAF_IDS = [...STAGE_ONE_LEAF_IDS, ...TREE_LEAF_SLOTS.slice(27, 37).map((slot) => slot.id)]
const STAGE_THREE_LEAF_IDS = [...STAGE_TWO_LEAF_IDS, ...TREE_LEAF_SLOTS.slice(14, 19).map((slot) => slot.id), ...TREE_LEAF_SLOTS.slice(37, 44).map((slot) => slot.id)]
const STAGE_FOUR_LEAF_IDS = [...STAGE_THREE_LEAF_IDS, ...TREE_LEAF_SLOTS.slice(19, 23).map((slot) => slot.id), ...TREE_LEAF_SLOTS.slice(44, 56).map((slot) => slot.id)]
const STAGE_FIVE_LEAF_IDS = [...STAGE_FOUR_LEAF_IDS, ...TREE_LEAF_SLOTS.slice(23, 27).map((slot) => slot.id), ...TREE_LEAF_SLOTS.slice(56, 64).map((slot) => slot.id)]

export const TREE_STAGE_BLUEPRINTS: Record<TreeStage, TreeStageBlueprint> = {
  1: {
    stage: 1,
    name: 'Enchanted Young Tree',
    trunkPath: STAGE_ONE_TRUNK_PATH,
    trunkHighlightPath: STAGE_ONE_TRUNK_HIGHLIGHT_PATH,
    structureScale: { x: 0.72, y: 0.72 },
    crownScale: { x: 0.72, y: 0.68 },
    rootPaths: roots,
    branchIds: STAGE_ONE_BRANCH_IDS,
    availableLeafSlotIds: STAGE_ONE_LEAF_IDS,
    availableFlowerSlotIds: ['flower_slot_01', 'flower_slot_02'],
    availableFruitSlotIds: [],
    availableCreatureSlotIds: [],
    availableDecorationSlotIds: [],
  },
  // Crystal Music Tree has no polygon fruit artwork; earned fruit remains in saved progress.
  2: { stage: 2, name: 'Crystal Music Tree', trunkPath: STAGE_ONE_TRUNK_PATH, trunkHighlightPath: STAGE_ONE_TRUNK_HIGHLIGHT_PATH, structureScale: { x: 0.82, y: 0.82 }, crownScale: { x: 0.84, y: 0.8 }, rootPaths: roots, branchIds: branchIdsFor(2), availableLeafSlotIds: STAGE_TWO_LEAF_IDS, availableFlowerSlotIds: TREE_FLOWER_SLOTS.slice(0, 4).map((slot) => slot.id), availableFruitSlotIds: [], allowFruitOverflow: false, availableCreatureSlotIds: [], availableDecorationSlotIds: [] },
  3: { stage: 3, name: 'Singing Winter Tree', trunkPath: STAGE_ONE_TRUNK_PATH, trunkHighlightPath: STAGE_ONE_TRUNK_HIGHLIGHT_PATH, structureScale: { x: 0.91, y: 0.91 }, crownScale: { x: 0.94, y: 0.91 }, rootPaths: roots, branchIds: branchIdsFor(3), availableLeafSlotIds: STAGE_THREE_LEAF_IDS, availableFlowerSlotIds: TREE_FLOWER_SLOTS.slice(0, 6).map((slot) => slot.id), availableFruitSlotIds: TREE_FRUIT_SLOTS.slice(0, 3).map((slot) => slot.id), availableCreatureSlotIds: ['creature_slot_001'], availableDecorationSlotIds: ['decoration_slot_001'] },
  4: { stage: 4, name: 'Great Musical Tree', trunkPath: STAGE_ONE_TRUNK_PATH, trunkHighlightPath: STAGE_ONE_TRUNK_HIGHLIGHT_PATH, structureScale: { x: 1, y: 0.97 }, crownScale: { x: 1.03, y: 1 }, rootPaths: roots, branchIds: branchIdsFor(4), availableLeafSlotIds: STAGE_FOUR_LEAF_IDS, availableFlowerSlotIds: TREE_FLOWER_SLOTS.slice(0, 9).map((slot) => slot.id), availableFruitSlotIds: TREE_FRUIT_SLOTS.slice(0, 6).map((slot) => slot.id), availableCreatureSlotIds: TREE_CREATURE_SLOTS.slice(0, 3).map((slot) => slot.id), availableDecorationSlotIds: TREE_DECORATION_SLOTS.slice(0, 3).map((slot) => slot.id) },
  5: { stage: 5, name: 'Grand Memory Tree', trunkPath: STAGE_ONE_TRUNK_PATH, trunkHighlightPath: STAGE_ONE_TRUNK_HIGHLIGHT_PATH, structureScale: { x: 1.08, y: 1.05 }, crownScale: { x: 1.12, y: 1.08 }, rootPaths: roots, branchIds: branchIdsFor(5), availableLeafSlotIds: STAGE_FIVE_LEAF_IDS, availableFlowerSlotIds: TREE_FLOWER_SLOTS.map((slot) => slot.id), availableFruitSlotIds: TREE_FRUIT_SLOTS.map((slot) => slot.id), availableCreatureSlotIds: TREE_CREATURE_SLOTS.map((slot) => slot.id), availableDecorationSlotIds: TREE_DECORATION_SLOTS.map((slot) => slot.id) },
}
