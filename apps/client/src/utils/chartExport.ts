/** 图表导出：生成分享海报并保存/分享 */
import Taro from '@tarojs/taro'
import {
  renderChartPoster,
  ChartPosterOptions,
  POSTER_CANVAS_ID,
} from './chartPoster'

export type { ChartPosterOptions }

/**
 * 将页面上的 Canvas 画布导出为临时图片文件（2 倍分辨率）
 */
export function exportChartCanvas(canvasId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    Taro.createSelectorQuery()
      .select(`#${canvasId}`)
      .fields({ node: true })
      .exec(res => {
        const r = (Array.isArray(res) ? res[0] : res) as { node?: any } | null
        if (!r || !r.node) {
          reject(new Error('图表未就绪'))
          return
        }
        const node = r.node
        // 不传 x/y/width/height/dest*：默认导出整张位图（已按 dpr 放大，清晰），
        // 导出结果与画布的 CSS 尺寸/位置完全解耦
        const options = {
          canvas: node,
          success: (out: { tempFilePath: string }) => resolve(out.tempFilePath),
          fail: (err: { errMsg?: string }) =>
            reject(new Error(err?.errMsg || '导出失败')),
        }
        // 全局 API（基础库 2.7.0+）兼容性最好；部分环境没有 node.toTempFilePath
        if (typeof Taro.canvasToTempFilePath === 'function') {
          ;(Taro.canvasToTempFilePath as any)(options)
          return
        }
        if (typeof node.toTempFilePath === 'function') {
          node.toTempFilePath(options)
          return
        }
        reject(new Error('当前环境不支持导出图表'))
      })
  })
}

async function saveToAlbum(filePath: string) {
  try {
    await Taro.saveImageToPhotosAlbum({ filePath })
    Taro.showToast({ title: '已保存到相册', icon: 'success' })
  } catch (error) {
    const msg = String((error as Error)?.message || error)
    if (msg.includes('auth') || msg.includes('deny')) {
      const res = await Taro.showModal({
        title: '未获得相册权限',
        content: '保存图表需要相册权限，请在设置中开启',
        confirmText: '去设置',
      })
      if (res.confirm) {
        Taro.openSetting({})
      }
      return
    }
    Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
  }
}

async function shareImage(filePath: string) {
  // 低版本基础库不支持分享图片菜单时，退化为保存到相册
  if (!Taro.canIUse('showShareImageMenu')) {
    await saveToAlbum(filePath)
    Taro.showToast({ title: '已保存，可在相册中分享', icon: 'none' })
    return
  }
  try {
    await Taro.showShareImageMenu({ path: filePath })
  } catch (error) {
    // 用户取消不提示；其他失败兜底为保存
    const msg = String((error as Error)?.message || '')
    if (msg.includes('cancel')) return
    await saveToAlbum(filePath)
    Taro.showToast({ title: '已保存，可在相册中分享', icon: 'none' })
  }
}

/** 生成带宝宝信息的分享海报，并执行保存或分享 */
export async function deliverChartPoster(
  opts: ChartPosterOptions,
  action: 'save' | 'share',
) {
  Taro.showLoading({ title: '生成图片中', mask: true })
  let filePath: string
  try {
    await renderChartPoster(opts)
    filePath = await exportChartCanvas(POSTER_CANVAS_ID)
  } catch (error) {
    Taro.hideLoading()
    throw error
  }
  Taro.hideLoading()
  if (action === 'save') {
    await saveToAlbum(filePath)
  } else {
    await shareImage(filePath)
  }
}
