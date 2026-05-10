import { View, Text, Image, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { familyApi } from '../../utils/request'
import './index.scss'

definePageConfig({
  navigationBarTitleText: '家庭成员',
})

interface Member {
  id: string
  userId: string
  babyId: string
  role: string
  status: string
  user?: {
    id: string
    nickname?: string
    avatar?: string
    role?: string
  }
}

const ROLE_MAP: Record<string, string> = {
  father: '爸爸',
  mother: '妈妈',
  grandfather: '爷爷',
  grandmother: '奶奶',
  other: '家人',
  owner: '创建者',
}

export default function FamilyPage() {
  const { userInfo } = useAuthStore()
  const { currentBaby, babies, fetchBabies } = useBabyStore()
  const [members, setMembers] = useState<Member[]>([])
  const [isBound, setIsBound] = useState(false)
  const [isOwner, setIsOwner] = useState(false)

  // Invite & Join state
  const [inviteCode, setInviteCode] = useState('')
  const [inputInviteCode, setInputInviteCode] = useState('')

  useDidShow(() => {
    loadData()
    fetchBabies()
  })

  const loadData = async () => {
    try {
      const [membersRes, bindingRes] = await Promise.all([
        familyApi.getMembers(),
        familyApi.getBindingStatus(),
      ])
      setMembers(membersRes.data || [])
      const bound = bindingRes.data?.isBound ?? false
      const reason = bindingRes.data?.reason
      setIsBound(bound)
      // 未绑定说明没有家庭成员，自己就是创建者；已绑定且 reason 是 owner 也是创建者
      setIsOwner(!bound || reason === 'owner')
    } catch (error) {
      console.error('加载家庭数据失败', error)
    }
  }

  const handleDeleteMember = async (member: Member) => {
    const name = member.user?.nickname || '该成员'
    const res = await Taro.showModal({
      title: '移除成员',
      content: `确定要移除 ${name} 吗？`,
    })
    if (res.confirm) {
      try {
        await familyApi.removeMember(member.id)
        Taro.showToast({ title: '已移除', icon: 'success' })
        loadData()
      } catch (error) {
        Taro.showToast({ title: '操作失败', icon: 'none' })
      }
    }
  }

  const handleCreateInvite = async () => {
    const baby = currentBaby || babies[0]
    if (!baby) {
      Taro.showToast({ title: '请先添加宝贝', icon: 'none' })
      return
    }
    try {
      const res = await familyApi.createInvite(baby.id)
      setInviteCode(res.data.inviteCode)
    } catch (error) {
      Taro.showToast({ title: '生成邀请码失败', icon: 'none' })
    }
  }

  const handleCopyInviteCode = () => {
    Taro.setClipboardData({
      data: inviteCode,
      success: () => {
        Taro.showToast({ title: '已复制', icon: 'success' })
      },
    })
  }

  const handleAcceptInvite = async () => {
    if (!inputInviteCode.trim()) {
      Taro.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    try {
      await familyApi.acceptInvite(inputInviteCode.trim())
      Taro.showToast({ title: '加入成功', icon: 'success' })
      setInputInviteCode('')
      loadData()
    } catch (error) {
      Taro.showToast({ title: '邀请码无效或已绑定家庭', icon: 'none' })
    }
  }

  const handleLeaveFamily = async () => {
    const res = await Taro.showModal({
      title: '退出家庭',
      content: '退出后将无法查看该家庭的宝贝信息，确定要退出吗？',
      confirmText: '确定退出',
      confirmColor: '#FF8A8A',
    })
    if (res.confirm) {
      try {
        await familyApi.leaveFamily()
        Taro.showToast({ title: '已退出家庭', icon: 'success' })
        loadData()
      } catch (error) {
        Taro.showToast({ title: '操作失败', icon: 'none' })
      }
    }
  }

  const getRoleText = (role?: string) => ROLE_MAP[role || ''] || '家人'

  return (
    <View className="family-page">
      {/* Family members */}
      <View className="section-card">
        <Text className="section-title">家庭成员</Text>
        {members.length === 0 ? (
          <View className="members-empty">
            <Text className="members-empty-text">暂无其他成员</Text>
            <Text className="members-empty-desc">分享邀请码给家人，共同记录宝宝成长</Text>
          </View>
        ) : (
          <View className="members-list">
            {members.map(member => (
              <View key={member.id} className="member-item">
                <View className="member-avatar">
                  {member.user?.avatar ? (
                    <Image src={member.user.avatar} mode="aspectFill" />
                  ) : (
                    <Text>👤</Text>
                  )}
                </View>
                <View className="member-info">
                  <Text className="member-name">{member.user?.nickname || '未知用户'}</Text>
                  <Text className="member-role-tag">{getRoleText(member.user?.role || member.role)}</Text>
                </View>
                {isOwner && member.userId !== userInfo?.id && (
                  <View className="member-delete" onClick={() => handleDeleteMember(member)}>
                    <Text className="member-delete-text">移除</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Invite family - only for owner */}
      {isOwner && (
        <View className="section-card">
          <Text className="section-title">邀请家人</Text>
          <Text className="section-desc">分享邀请码给家人，即可共同记录宝宝成长</Text>
          {inviteCode ? (
            <View className="invite-code-box">
              <Text className="invite-code-text">{inviteCode}</Text>
              <View className="invite-copy-btn" onClick={handleCopyInviteCode}>
                <Text>复制</Text>
              </View>
            </View>
          ) : (
            <View className="invite-generate-btn" onClick={handleCreateInvite}>
              <Text>生成邀请码</Text>
            </View>
          )}
        </View>
      )}

      {/* Join family - hidden if already bound */}
      {!isBound && (
        <View className="section-card">
          <Text className="section-title">加入家庭</Text>
          <Text className="section-desc">输入家人的邀请码，即可查看宝宝信息</Text>
          <View className="invite-input-row">
            <Input
              className="invite-input"
              value={inputInviteCode}
              onInput={e => setInputInviteCode(e.detail.value)}
              placeholder="请输入邀请码"
              maxlength={8}
            />
            <View className="invite-join-btn" onClick={handleAcceptInvite}>
              <Text>加入</Text>
            </View>
          </View>
        </View>
      )}

      {/* Leave family - only for members */}
      {!isOwner && isBound && (
        <View className="section-card">
          <View className="leave-btn" onClick={handleLeaveFamily}>
            <Text className="leave-btn-text">退出家庭</Text>
          </View>
        </View>
      )}
    </View>
  )
}
