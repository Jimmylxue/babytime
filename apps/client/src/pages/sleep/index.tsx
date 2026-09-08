import { View, Text, Image, Textarea, Picker } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { useState, useRef } from 'react'
import { useRecordStore } from '../../stores/recordStore'
import { recordApi, trackEvent } from '../../utils/request'
import { formatDate, formatHM, formatDurationLong } from '../../utils/date'
import heroIllustration from '../../assets/sleep-baby.png'
import calendarIcon from '../../assets/icons/calendar-coral.svg'
import sleepMoonIcon from '../../assets/icons/sleep-moon.svg'
import sleepWakeIcon from '../../assets/icons/sleep-wake.svg'
import sleepMoonStarIcon from '../../assets/icons/sleep-moon-star.svg'
import sleepNoteIcon from '../../assets/icons/sleep-note.svg'
import starPaleIcon from '../../assets/icons/star-pale.svg'
import chevronGrayIcon from '../../assets/icons/chevron-gray.svg'
import saveWhiteIcon from '../../assets/icons/save-solid-white.svg'
import { getSleepRange } from '../record/components/timeUtils'
import './index.scss'

// 睡眠记录独立设计页：入睡/起床时间 + 自动时长，与喂奶独立页同模式
export default function SleepPage() {
  const router = useRouter()
  const { babyId, id } = router.params
  const isEdit = !!id
  const { addRecord, updateRecord } = useRecordStore()

  const [loading, setLoading] = useState(false)
  // 同步锁，避免 state 异步更新导致连点漏拦截
  const submittingRef = useRef(false)
  const [recordDate, setRecordDate] = useState(formatDate(new Date()))
  const [sleepStart, setSleepStart] = useState(formatHM(new Date()))
  const [sleepEnd, setSleepEnd] = useState(formatHM(new Date()))
  const [note, setNote] = useState('')
  const today = formatDate(new Date())

  // 编辑态：进入页面时拉取原始记录回填
  useDidShow(() => {
    if (isEdit && id) fetchRecord()
  })

  const fetchRecord = async () => {
    if (!id) return
    try {
      const res = await recordApi.getOne(id)
      const record = res.data
      if (!record) return
      setRecordDate(formatDate(record.startTime))
      setSleepStart(formatHM(record.startTime))
      if (record.endTime) setSleepEnd(formatHM(record.endTime))
      if (record.note) setNote(record.note)
    } catch (error) {
      // 错误提示由全局拦截器统一 toast
    }
  }

  // 起床早于入睡按跨天推算（同时刻=睡满全天），与通用记录页口径一致
  const { durationMinutes } = getSleepRange(recordDate, sleepStart, sleepEnd)
  const isFullDay = durationMinutes >= 24 * 60
  const durationText = isFullDay ? '24小时' : formatDurationLong(durationMinutes)

  const handleSubmit = async () => {
    if (submittingRef.current) return
    if (!babyId) {
      Taro.showToast({ title: '请先选择宝宝', icon: 'none' })
      return
    }
    submittingRef.current = true
    setLoading(true)
    try {
      const { start, end, durationMinutes } = getSleepRange(
        recordDate,
        sleepStart,
        sleepEnd,
      )
      const data: any = {
        babyId,
        type: 'sleep',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        duration: durationMinutes,
      }
      if (note) data.note = note

      if (isEdit) {
        // 更新接口由记录 ID 确定所属宝宝和记录类型，不能重复提交创建专用字段。
        const { babyId: _babyId, type: _type, ...updateData } = data
        await updateRecord(id, updateData)
        Taro.showToast({ title: '更新成功', icon: 'success' })
      } else {
        await addRecord(data)
        void trackEvent('record_created', { type: 'sleep', babyId })
        // 累计记录数 +1，用于「添加到我的小程序」引导（记满 3 条弹一次）
        const cumulative =
          (Taro.getStorageSync('stats:cumulativeRecords') || 0) + 1
        Taro.setStorageSync('stats:cumulativeRecords', cumulative)
        Taro.showToast({ title: '已记录', icon: 'success' })
      }
      setTimeout(() => Taro.navigateBack(), 1500)
    } catch (error) {
      submittingRef.current = false
      setLoading(false)
      // 失败原因（如内容安全拦截）由 request 全局拦截器统一 toast，这里只复位状态
    }
  }

  return (
    <View className="sleep-page">
      <View className="sleep-hero">
        <View className="sleep-hero-title-row">
          <Text className="sleep-hero-emoji">😴</Text>
          <Text className="sleep-hero-title">睡眠记录</Text>
        </View>
        <Text className="sleep-hero-sub">记录宝宝的睡眠，见证成长每一天</Text>
        <Image className="sleep-hero-illu" src={heroIllustration} mode="aspectFit" />
      </View>

      <View className="sleep-card">
        <Picker
          mode="date"
          value={recordDate}
          end={today}
          onChange={e => setRecordDate(e.detail.value)}
        >
          <View className="sleep-row">
            <View className="sleep-row-icon">
              <Image className="sleep-row-icon-img" src={calendarIcon} />
            </View>
            <Text className="sleep-row-label">发生日期</Text>
            <Text className="sleep-row-value">{recordDate}</Text>
            <Image className="sleep-chevron" src={chevronGrayIcon} />
          </View>
        </Picker>
        <View className="sleep-divider" />

        <Picker
          mode="time"
          value={sleepStart}
          onChange={e => setSleepStart(e.detail.value)}
        >
          <View className="sleep-row">
            <View className="sleep-row-icon">
              <Image className="sleep-row-icon-img" src={sleepMoonIcon} />
            </View>
            <Text className="sleep-row-label">入睡时间</Text>
            <Text className="sleep-row-value">{sleepStart}</Text>
            <Image className="sleep-chevron" src={chevronGrayIcon} />
          </View>
        </Picker>
        <View className="sleep-divider" />

        <Picker
          mode="time"
          value={sleepEnd}
          onChange={e => setSleepEnd(e.detail.value)}
        >
          <View className="sleep-row">
            <View className="sleep-row-icon">
              <Image className="sleep-row-icon-img" src={sleepWakeIcon} />
            </View>
            <Text className="sleep-row-label">起床时间</Text>
            <Text className="sleep-row-value">{sleepEnd}</Text>
            <Image className="sleep-chevron" src={chevronGrayIcon} />
          </View>
        </Picker>

        <View className="sleep-duration">
          <Image className="sleep-duration-star star-a" src={starPaleIcon} />
          <Image className="sleep-duration-star star-b" src={starPaleIcon} />
          <Image className="sleep-duration-star star-c" src={starPaleIcon} />
          <View className="sleep-duration-label-row">
            <Image className="sleep-duration-label-icon" src={sleepMoonStarIcon} />
            <Text className="sleep-duration-label">睡眠时长</Text>
          </View>
          <View className="sleep-duration-value-row">
            <Text className="sleep-duration-value">{durationText}</Text>
            {isFullDay && <Text className="sleep-duration-suffix">（全天）</Text>}
          </View>
        </View>

        <View className="sleep-row sleep-note-row">
          <View className="sleep-row-icon">
            <Image className="sleep-row-icon-img" src={sleepNoteIcon} />
          </View>
          <Text className="sleep-row-label">备注</Text>
          <Text className="sleep-row-label-sub">（可选）</Text>
        </View>
        <View className="sleep-note-area">
          <Textarea
            className="sleep-note-input"
            placeholder="添加备注..."
            placeholderStyle="color: #A6A5AA"
            maxlength={100}
            value={note}
            onInput={e => setNote(e.detail.value)}
          />
          <Text className="sleep-note-counter">{note.length}/100</Text>
        </View>
      </View>

      <View
        className={`sleep-save${loading ? ' disabled' : ''}`}
        onClick={loading ? undefined : handleSubmit}
      >
        <Image className="sleep-save-icon" src={saveWhiteIcon} />
        <Text className="sleep-save-text">
          {loading ? '保存中...' : isEdit ? '保存修改' : '保存记录'}
        </Text>
      </View>
    </View>
  )
}
