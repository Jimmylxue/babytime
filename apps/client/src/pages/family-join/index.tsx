import { View, Text, Image, Button } from '@tarojs/components'
import Taro, { useDidShow, useShareAppMessage, useRouter } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { familyApi } from '../../utils/request'
import babyFacePink from '../../assets/icons/baby-face-pink.svg'
import babyFaceBlue from '../../assets/icons/baby-face-blue.svg'
import './index.scss'

/**
 * 家庭邀请落地页：家人点分享卡片进入
 * 流程：未登录 → 去登录（带回流参数）→ 查邀请信息 → 确认加入 → 回首页
 */
export default function FamilyJoinPage() {
  const router = useRouter()
  const inviteCode = router.params.invite || ''

  const { isLoggedIn } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [joining, setJoining] = useState(false)
  const [info, setInfo] = useState<{
    valid: boolean
    reason: 'invalid' | 'expired' | 'own' | 'already_member' | 'bound_other' | 'full' | null
    inviterNickname: string
    babyName: string
    babyGender?: 'male' | 'female'
  } | null>(null)

  // 转发不断链：卡片可继续转给其他家人
  useShareAppMessage(() => ({
    title: `${info?.inviterNickname || '家人'}邀请你加入${info?.babyName || '宝宝'}的成长记录`,
    path: `/pages/family-join/index?invite=${inviteCode}`,
  }))

  useDidShow(() => {
    if (!isLoggedIn || !inviteCode) return
    fetchInviteInfo()
  })

  const fetchInviteInfo = async () => {
    setLoading(true)
    try {
      const res = await familyApi.getInviteInfo(inviteCode)
      setInfo(res.data)
    } catch (error) {
      setInfo({ valid: false, reason: 'invalid', inviterNickname: '', babyName: '' })
    } finally {
      setLoading(false)
    }
  }

  const goLogin = () => {
    Taro.navigateTo({
      url: `/pages/login/index?redirect=family-join&invite=${inviteCode}`,
    })
  }

  const goHome = () => {
    Taro.switchTab({ url: '/pages/index/index' })
  }

  const handleJoin = async () => {
    if (joining) return
    setJoining(true)
    try {
      await familyApi.acceptInvite(inviteCode)
      Taro.showToast({ title: '加入成功', icon: 'success' })
      setTimeout(() => {
        Taro.switchTab({ url: '/pages/index/index' })
      }, 1200)
    } catch (error) {
      setJoining(false)
      fetchInviteInfo()
    } finally {
      setJoining(false)
    }
  }

  const renderBody = () => {
    // 未登录
    if (!isLoggedIn) {
      return (
        <View className="fj-state">
          <Text className="fj-state-icon">👨‍👩‍👧</Text>
          <Text className="fj-state-title">登录后加入家庭</Text>
          <Text className="fj-state-desc">登录即可实时查看宝宝的成长记录</Text>
          <View className="fj-primary-btn" onClick={goLogin}>
            <Text className="fj-primary-btn-text">微信一键登录</Text>
          </View>
        </View>
      )
    }

    // 加载中
    if (loading || (!info && inviteCode)) {
      return (
        <View className="fj-state">
          <Text className="fj-state-desc">正在获取邀请信息...</Text>
        </View>
      )
    }

    // 缺少邀请参数
    if (!inviteCode) {
      return (
        <View className="fj-state">
          <Text className="fj-state-title">邀请链接无效</Text>
          <Text className="fj-state-desc">请让家人重新分享邀请卡</Text>
        </View>
      )
    }

    // 有效邀请：确认页
    if (info?.valid) {
      return (
        <View className="fj-invite-card">
          <Text className="fj-invite-hello">
            {info.inviterNickname} 邀请你加入家庭
          </Text>
          <View className="fj-baby">
            <View className="fj-baby-avatar">
              <Image
                className="fj-baby-avatar-icon"
                src={info.babyGender === 'male' ? babyFaceBlue : babyFacePink}
              />
            </View>
            <Text className="fj-baby-name">{info.babyName}</Text>
          </View>
          <Text className="fj-invite-desc">加入后可实时查看宝宝的成长记录</Text>
          <View className="fj-primary-btn" onClick={handleJoin}>
            <Text className="fj-primary-btn-text">
              {joining ? '加入中...' : '加入家庭'}
            </Text>
          </View>
        </View>
      )
    }

    // 各种不可加入的状态
    const stateMap = {
      expired: {
        icon: '⏰',
        title: '邀请已过期',
        desc: `请联系 ${info?.inviterNickname || '家人'} 重新分享邀请卡`,
      },
      full: {
        icon: '👨‍👩‍👧‍👦',
        title: '家庭成员已满',
        desc: '一个家庭最多 8 位成员',
      },
      already_member: {
        icon: '✅',
        title: '你已经在该家庭中',
        desc: '无需重复加入，直接去看宝宝吧',
      },
      bound_other: {
        icon: '🏠',
        title: '无法加入新家庭',
        desc: '一个账号只能加入一个家庭',
      },
      own: {
        icon: '📎',
        title: '这是你自己分享的邀请卡',
        desc: '把卡片发给家人，他们点开即可加入',
      },
      invalid: {
        icon: '🚫',
        title: '邀请无效',
        desc: '邀请卡不存在或已被撤销，请联系邀请人重新分享',
      },
    }
    const state = stateMap[info?.reason || 'invalid'] || stateMap.invalid
    return (
      <View className="fj-state">
        <Text className="fj-state-icon">{state.icon}</Text>
        <Text className="fj-state-title">{state.title}</Text>
        <Text className="fj-state-desc">{state.desc}</Text>
        {(info?.reason === 'already_member' || info?.reason === 'own') && (
          <View className="fj-primary-btn" onClick={goHome}>
            <Text className="fj-primary-btn-text">进入首页</Text>
          </View>
        )}
      </View>
    )
  }

  return (
    <View className="fj-page">
      {renderBody()}
      {/* 仅供微信里长按转发用，正常界面不展示分享按钮 */}
      {isLoggedIn && info?.valid && (
        <Button
          className="fj-share-fallback"
          openType="share"
          plain
          size="mini"
        >
          转给其他家人
        </Button>
      )}
    </View>
  )
}
